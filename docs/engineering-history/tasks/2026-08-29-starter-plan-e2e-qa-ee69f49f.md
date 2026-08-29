# Engineering History — Starter plan e2e qa

| | |
|---|---|
| **Task Title** | Starter plan e2e qa |
| **Task Type** | QA — an exploratory end-to-end run against the Starter plan on the production demo tenant. No source file was changed; the output is records and knowledge. |
| **Date** | 2026-08-29 |
| **Architect Plan** | NOT_APPLICABLE — exploratory QA changes no code, so it is below the ExecPlan threshold in `PLANS.md`. The scope was fixed instead by the plan's own entitlement list: the seven features Starter grants, plus the five it does not, probed deliberately. |
| **Agents Used** | Architect (scope, triage, all live browser work), QA, Product & Backlog Steward (54 records), Knowledge & Graph (three knowledge documents plus the vault sync), Integrator (rebase, CI, ref-push). Six research agents ran in parallel for code verification. **Not used:** Backend/API, Frontend, Database, Security and the Reviewer — nothing was implemented, so there was no diff for them to own; the authorization findings are reported for triage, not fixed here. Release/DevOps was not used and `main` was untouched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/starter-plan-e2e-qa` |
| **Base SHA** | `949f461c2e9367d4b46ec78f4cf2bd9d884e9064` |
| **Final Task SHA** | `ee69f49f1b1a266c5745ce885ba46b9c05b07e2b` |
| **Target Branch** | `develop` — corrected from the script's derived value of `main`, which it infers from `origin/main` being the base. `main` was never a target and is `UNTOUCHED`. |
| **Merge Commit** | none — integrated by ref-push (`git push origin agent/starter-plan-e2e-qa:develop`), so `develop`'s tip **is** the CI-verified SHA rather than a merge of it |
| **Final Target SHA** | `ee69f49f` |

### Commits

```
3d2931c4 docs(release): BUG-0904 verified in production, and the release recorded
1003a2ac docs(history): the release, and the fix inside it that shipped and did nothing
c2db6311 feat(admin): convert revenue rather than exclude it, and one deletion rule
9e55663b docs(bugs): the migration was applied after all, and what that measured
8d83d842 docs(backlog): forty-eight fixes verified, two go-live blockers decided
287612d9 feat(auth): the contract phase, nine days late and one deployment apart
b64f6092 fix(go-live): the check that would have caught a silent payment failure
eb457d9d feat(smoke): the workspace host a customer is actually sent to
8381ecad docs(plan): what to cover in apps/web, and two facts that had expired
41eaadb4 fix(obsidian): every ExecPlan wikilink resolved to nothing
9be52564 test(web): the tenant product is opened by a browser for the first time
9353872e docs(qa): the coverage is reachable from the records that asked for it
60e164fe docs(session): SESSION-0069 closed, and what the burndown actually found
ee69f49f docs(qa): the Starter plan sells a leave module that cannot complete a request
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            60e164fe [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   60e164fe [agent/backlog-burndown]
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
D:/My Work/hrm-dijipeople/dijipeople-starter-qa                 ee69f49f [agent/starter-plan-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

242 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
M	.github/workflows/ci.yml
M	apps/admin/app/(internal)/agent-rollout/page.tsx
M	apps/admin/app/(internal)/app-releases/page.tsx
A	apps/admin/app/(internal)/settings/desktop-agent/page.tsx
A	apps/admin/app/(internal)/settings/exchange-rates/page.tsx
M	apps/admin/app/(internal)/settings/page.tsx
M	apps/admin/app/_components/admin-sidebar.tsx
M	apps/admin/app/_components/customers/payment-recheck-panel.tsx
M	apps/admin/app/_components/dashboard/platform-dashboard.tsx
A	apps/admin/app/_components/settings/desktop-agent-manager.tsx
A	apps/admin/app/_components/settings/exchange-rates-manager.tsx
A	apps/admin/app/api/super-admin/customers/[customerId]/payment-state/route.ts
A	apps/admin/app/api/super-admin/platform-settings/exchange-rates/[[...path]]/route.ts
A	apps/admin/lib/desktop-agent-settings.spec.ts
M	apps/admin/lib/runtime/platform-module-capabilities.spec.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
M	apps/admin/lib/runtime/platform-runtime.types.ts
M	apps/admin/lib/shell-landmarks.spec.ts
M	apps/landing/app/subscribe/onboarding-steps.tsx
M	apps/landing/lib/onboarding-wizard.ts
M	apps/web/AGENTS.md
A	docs/architecture/platform-fx-reporting.md
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md
M	docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md
M	docs/backlog/items/ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti.md
M	docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md
M	docs/backlog/items/ITEM-0075-the-subscribe-wizard-never-collects-companysize-which-the-ap.md
M	docs/backlog/items/ITEM-0081-nine-test-plans-are-needs-review-against-a-five-day-old-comm.md
M	docs/backlog/items/ITEM-0094-go-live-sh-reports-no-blocker-for-a-webhook-endpoint-that-re.md
M	docs/backlog/items/ITEM-0099-sync-obsidian-does-not-map-docs-plans-so-every-execplan-wiki.md
M	docs/backlog/items/ITEM-0103-deployment-check-the-composed-tenant-workspace-host-must-res.md
A	docs/backlog/items/ITEM-0104-the-customization-settings-category-renders-no-leaf-pages-in.md
A	docs/backlog/items/ITEM-0105-the-leave-entitlement-dialog-cannot-set-accrualtype-which-th.md
A	docs/backlog/items/ITEM-0106-an-employee-cannot-use-self-service-until-their-manager-acti.md
A	docs/backlog/items/ITEM-0107-three-separate-users-screens-exist-in-the-tenant-app.md
A	docs/backlog/items/ITEM-0108-decide-whether-the-roughly-one-hour-session-lifetime-is-idle.md
A	docs/backlog/items/ITEM-0109-the-disabled-check-in-button-explains-itself-only-in-a-title.md
A	docs/backlog/items/ITEM-0110-attendance-entry-appears-to-create-timesheet-drafts-on-a-ten.md
A	docs/backlog/items/ITEM-0111-protected-route-prefixes-omits-twelve-authenticated-route-tr.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md
M	docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md
M	docs/bugs/BUG-0900-tenant-provisioning-exceeds-the-5s-transaction-timeout-a-pai.md
M	docs/bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md
M	docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md
M	docs/bugs/BUG-0905-production-defines-direct-url-but-the-code-reads-direct-data.md
M	docs/bugs/BUG-1128-stripe-api-version-skew-invoice-paid-cannot-map-to-a-subscri.md
M	docs/bugs/BUG-1203-repo-health-reports-changed-by-this-task-for-another-session.md
M	docs/bugs/BUG-1208-component-index-check-fails-on-every-windows-checkout-passes.md
M	docs/bugs/BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-.md
M	docs/bugs/BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-.md
M	docs/bugs/BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read.md
M	docs/bugs/BUG-1425-currencycode-accepts-any-string-of-three-characters-or-fewer.md
M	docs/bugs/BUG-1494-git-worktree-remove-follows-node-modules-junctions-and-delet.md
M	docs/bugs/BUG-1516-public-signup-creates-duplicate-customer-records-breaking-st.md
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
M	docs/bugs/BUG-1649-api-proxy-routes-copy-the-upstream-content-encoding-onto-an-.md
M	docs/bugs/BUG-1654-every-empty-list-in-a-new-workspace-blames-filters-that-are-.md
M	docs/bugs/BUG-1655-tenant-login-password-field-has-no-accessible-name-and-no-au.md
M	docs/bugs/BUG-1668-tenant-workspace-pages-scroll-horizontally-at-mobile-width.md
M	docs/bugs/BUG-1673-tenant-workspace-shell-repeats-three-h1-headings-and-two-mai.md
M	docs/bugs/BUG-1742-lead-creation-is-impossible-the-runtime-form-always-sends-pa.md
M	docs/bugs/BUG-1743-customers-and-partners-cannot-be-edited-the-runtime-form-ech.md
M	docs/bugs/BUG-1744-every-subscription-has-a-zero-length-billing-period-and-a-re.md
M	docs/bugs/BUG-1745-the-executive-dashboard-reports-zero-revenue-because-reporti.md
M	docs/bugs/BUG-1746-required-fields-on-unselected-tabs-are-undiscoverable-so-cre.md
M	docs/bugs/BUG-1747-partner-currency-is-a-required-numeric-input-so-partner-crea.md
M	docs/bugs/BUG-1748-the-subscription-record-page-cannot-resolve-its-own-tenant-p.md
M	docs/bugs/BUG-1749-admin-creates-plans-that-can-never-be-sold-and-can-never-be-.md
M	docs/bugs/BUG-1750-the-monitoring-critical-tile-miscounts-and-links-to-a-filter.md
M	docs/bugs/BUG-1751-a-promotion-goes-live-against-every-subscription-the-instant.md
M	docs/bugs/BUG-1752-admin-empty-states-blame-filters-that-are-not-set.md
M	docs/bugs/BUG-1753-lookup-display-labels-mangle-acronyms-and-numeric-ranges-acr.md
M	docs/bugs/BUG-1754-the-incident-queue-counts-routine-401s-and-unknown-route-404.md
M	docs/bugs/BUG-1755-the-plans-list-cannot-show-publication-status-or-sales-model.md
M	docs/bugs/BUG-1756-bulk-delete-confirms-without-naming-how-many-records-or-whic.md
M	docs/bugs/BUG-1757-promotions-cannot-be-deleted-and-the-delete-route-silently-d.md
A	docs/bugs/BUG-1883-app-releases-and-agent-rollout-render-on-a-shell-no-other-ad.md
A	docs/bugs/BUG-1884-the-re-check-payment-action-is-offered-on-every-customer-inc.md
A	docs/bugs/BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page.md
A	docs/bugs/BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin.md
A	docs/bugs/BUG-1952-plan-entitlements-gate-nothing-so-a-starter-tenant-can-use-e.md
A	docs/bugs/BUG-1953-plan-detail-reports-zero-subscriptions-while-the-plans-list-.md
A	docs/bugs/BUG-1954-the-starter-annual-price-tile-renders-pkr-120-000-00-for-a-p.md
A	docs/bugs/BUG-1955-every-404-is-reported-to-the-user-as-database-record-not-fou.md
A	docs/bugs/BUG-1956-runtime-lookup-comboboxes-expose-no-listbox-or-option-semant.md
A	docs/bugs/BUG-1957-a-department-with-no-business-unit-cannot-be-listed-opened-e.md
A	docs/bugs/BUG-1958-deleting-a-department-never-releases-its-name-so-it-can-neve.md
A	docs/bugs/BUG-1959-the-departments-list-returns-a-bare-array-and-rejects-the-pa.md
A	docs/bugs/BUG-1960-the-departments-table-overflows-its-settings-panel-by-111px-.md
A	docs/bugs/BUG-1961-a-leave-policy-assignment-cannot-be-created-from-the-ui-beca.md
A	docs/bugs/BUG-1962-assigned-on-is-required-by-the-leave-assignment-api-and-rend.md
A	docs/bugs/BUG-1963-runtime-dialogs-show-the-end-user-the-raw-server-message-and.md
A	docs/bugs/BUG-1964-record-headings-and-dialog-titles-are-singularised-by-stripp.md
A	docs/bugs/BUG-1965-the-leave-request-form-sends-ownerid-and-status-which-the-ap.md
A	docs/bugs/BUG-1966-a-failed-save-in-the-runtime-form-is-swallowed-with-no-messa.md
A	docs/bugs/BUG-1967-leave-entitlement-is-never-allocated-to-a-balance-so-every-l.md
A	docs/bugs/BUG-1968-leave-approval-routing-requires-an-active-reporting-manager-.md
A	docs/bugs/BUG-1969-an-invited-approver-is-rejected-with-a-message-that-blames-t.md
A	docs/bugs/BUG-1970-the-elevated-role-bypass-precedes-the-self-requester-check-o.md
A	docs/bugs/BUG-1974-246-of-591-tenant-setting-keys-have-no-reader-and-230-of-the.md
A	docs/bugs/BUG-1976-eight-settings-controls-write-a-key-name-the-resolver-never-.md
A	docs/bugs/BUG-1977-the-platform-localization-panel-queries-dotted-setting-keys-.md
A	docs/bugs/BUG-1978-two-attendance-checkboxes-are-not-catalog-keys-so-touching-e.md
A	docs/bugs/BUG-1979-seven-attendance-settings-are-overwritten-on-write-and-the-a.md
A	docs/bugs/BUG-1980-one-saved-attendance-policy-permanently-overrides-the-attend.md
A	docs/bugs/BUG-1981-resolvepolicy-hardcodes-seven-location-values-and-inverts-tw.md
A	docs/bugs/BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i.md
A	docs/bugs/BUG-2003-the-tenant-users-screen-crashes-into-the-error-boundary-for-.md
A	docs/bugs/BUG-2004-the-approvals-inbox-offers-a-new-action-whose-page-crashes-i.md
A	docs/bugs/BUG-2005-manual-attendance-accepts-a-date-arbitrarily-far-in-the-futu.md
A	docs/bugs/BUG-2006-a-successful-save-reports-nothing-to-the-user-on-the-runtime.md
A	docs/bugs/BUG-2007-projects-and-customers-can-be-created-but-never-deleted.md
A	docs/bugs/BUG-2008-every-employee-is-counted-absent-on-a-non-working-day-and-ra.md
A	docs/bugs/BUG-2009-display-labels-fall-through-to-the-raw-field-key-or-raw-enum.md
A	docs/bugs/BUG-2010-the-dashboard-recent-changes-list-renders-unformatted-iso-86.md
A	docs/bugs/BUG-2011-seven-related-list-dialogs-never-send-the-parent-foreign-key.md
A	docs/bugs/BUG-2012-the-related-list-create-dialog-pre-fills-child-fields-with-t.md
A	docs/bugs/BUG-2013-the-dashboard-error-boundary-classifies-server-component-fai.md
A	docs/bugs/BUG-2014-users-new-and-users-import-are-shadowed-by-the-user-detail-r.md
A	docs/bugs/BUG-2015-approving-and-rejecting-leave-is-gated-on-read-permission-an.md
A	docs/bugs/BUG-2016-cancelling-a-leave-request-leaves-its-needs-approval-notific.md
A	docs/bugs/BUG-2017-the-inbox-related-record-column-renders-a-bare-uuid-with-no-.md
A	docs/bugs/BUG-2026-the-employee-export-produces-columns-the-employee-import-tem.md
A	docs/bugs/BUG-2043-the-audit-events-screen-reports-the-number-of-rows-it-loaded.md
A	docs/bugs/BUG-2044-no-employee-lifecycle-event-is-audited-including-employee-cr.md
A	docs/bugs/BUG-2045-timesheet-background-job-completions-make-up-71-percent-of-t.md
A	docs/bugs/BUG-2046-audit-actions-use-two-naming-conventions-and-the-result-colu.md
M	docs/development/browser-e2e.md
A	docs/engineering-history/tasks/2026-08-28-admin-console-fx-and-agent-settings-9e55663b.md
A	docs/engineering-history/tasks/2026-08-28-promote-open-bug-sweep-to-production-3d2931c4.md
A	docs/engineering-history/tasks/2026-08-29-backlog-burndown-9353872e.md
A	docs/knowledge/architecture/settings-and-configuration.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/framework/trust-the-runtime-invariant-over-a-static-scan.md
M	docs/knowledge/modules/approvals.md
M	docs/knowledge/modules/attendance.md
A	docs/knowledge/modules/leave-attendance-approvals.md
M	docs/knowledge/modules/settings.md
M	docs/knowledge/product/product-areas.md
A	docs/knowledge/product/starter-plan-scope.md
A	docs/knowledge/releases/2026-08-28-open-bug-sweep.md
A	docs/plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md
A	docs/plans/EXECPLAN-0025-apps-web-browser-e2e-coverage.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-28-regression-guard-sweep-9e55663.md
A	docs/qa/runs/2026-08-29-starter-plan-e2e-eb457d9.md
A	docs/qa/scenarios/QA-AGENT-008-the-desktop-agent-is-one-settings-screen-on-the-shared-shell.md
M	docs/qa/scenarios/QA-TENANT-050-leads-are-withdrawn-rather-than-bulk-deleted.md
A	docs/qa/scenarios/QA-TENANT-052-the-payment-panel-asks-what-the-payment-is-doing-before-offe.md
A	docs/qa/scenarios/QA-TENANT-053-the-tenant-product-opens-module-by-module-for-the-plan-a-ten.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-002-authorization.md
M	docs/qa/test-plans/PLAN-004-commercial-onboarding.md
M	docs/qa/test-plans/PLAN-005-lead-management.md
M	docs/qa/test-plans/PLAN-006-partner-lifecycle.md
M	docs/qa/test-plans/PLAN-008-agent-desktop.md
M	docs/qa/test-plans/PLAN-009-attendance.md
M	docs/qa/test-plans/PLAN-010-payroll.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/PLAN-020-billing.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0067-promote-the-open-bug-sweep-to-production.md
A	docs/sessions/SESSION-0068-admin-console-fx-reporting-desktop-agent-settings-generic-bu.md
A	docs/sessions/SESSION-0069-backlog-burndown-verify-the-fixed-decide-the-deferred-close-.md
A	docs/sessions/SESSION-0070-starter-plan-e2e-qa-on-the-demo-tenant.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/TASK-0009-identity-and-multi-tenant-membership.md
M	docs/tasks/TASK-0024-dlp-investigator-review-on-the-employee-record.md
M	docs/tasks/active.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	e2e/fixtures/environment.ts
A	e2e/fixtures/web-session.ts
A	e2e/tests/flow-h-tenant-sign-in.spec.ts
A	e2e/tests/flow-i-growth-modules.spec.ts
A	e2e/tests/flow-j-tenant-settings.spec.ts
M	packages/config/platform-runtime-schema.generated.json
M	scripts/go-live.sh
M	scripts/lib/obsidian-mappings.mjs
M	scripts/smoke-deployment.mjs
A	scripts/webhook-delivery-health.mjs
A	services/api/prisma/migrations/20260828220000_platform_exchange_rate/migration.sql
A	services/api/prisma/migrations/20260829090000_identity_contract/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/src/modules/billing/services/payment-recheck.service.ts
A	services/api/src/modules/billing/services/payment-state.spec.ts
M	services/api/src/modules/leads/admin-leads.controller.ts
D	services/api/src/modules/leads/bulk-delete-withdrawn.spec.ts
A	services/api/src/modules/platform-runtime/generic-delete.spec.ts
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
A	services/api/src/modules/super-admin/dashboard-fx.spec.ts
A	services/api/src/modules/super-admin/dto/exchange-rate.dto.ts
A	services/api/src/modules/super-admin/platform-fx.service.spec.ts
A	services/api/src/modules/super-admin/platform-fx.service.ts
M	services/api/src/modules/super-admin/promotion-safety.spec.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
M	services/api/src/modules/super-admin/super-admin.module.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
A	services/api/src/modules/tenant-control-plane/activation-advisories.spec.ts
M	services/api/src/modules/tenant-control-plane/tenant-control-plane.service.ts
M	services/api/src/modules/users/identity.service.ts
M	services/api/test/admin-logout-revocation.e2e-spec.ts
M	services/api/test/attendance-integrations-http.e2e-spec.ts
M	services/api/test/attendance-operational.e2e-spec.ts
M	services/api/test/attendance-review.e2e-spec.ts
M	services/api/test/gateway-runtime.e2e-spec.ts
D	services/api/test/identity-backfill.e2e-spec.ts
A	services/api/test/identity-contract.e2e-spec.ts
M	services/api/test/identity-login.e2e-spec.ts
M	services/api/test/identity-model.e2e-spec.ts
M	services/api/test/identity-second-workspace.e2e-spec.ts
M	services/api/test/tenant-activation.e2e-spec.ts
M	services/api/test/tenant-provisioning-recovery.e2e-spec.ts
M	services/api/test/workspace-discovery-auth.e2e-spec.ts
M	services/api/test/workspace-discovery.e2e-spec.ts
```

## Conflicts

`develop` moved twice during the run — from `eb457d9d` (this branch's base) to
`9353872e`, then to `60e164fe` — while a concurrent session landed the first
browser E2E coverage for `apps/web` and closed SESSION-0069. Rebasing onto
`60e164fe` produced **nine conflicts, all of the same type: generated index**.

| File | Both sides intended |
|---|---|
| `docs/backlog/index.md` | each side's own new records appended to the same generated table |
| `docs/backlog/open.md` | same |
| `docs/backlog/deferred.md` | same |
| `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | regenerated counts |
| `docs/knowledge/dashboards/DijiPeople Product Dashboard.md` | regenerated counts |
| `docs/knowledge/dashboards/Engineering Control Center.md` | regenerated counts |
| `docs/sessions/active.md` | their session closing, mine still active |
| `docs/sessions/index.md` | same |
| `docs/tasks/remediation/TASK-0005-inventory.json` | each side's rows added to one synced inventory |

Not one conflict was in a hand-authored file. No source file conflicted, because
this task changed none.

## Conflict Resolutions

**Every conflict resolved by taking `origin/develop`'s side wholesale, then
re-running the generators that own each file** — `backlog:rebuild`,
`remediation:sync`, `rebuild-sessions.mjs`, `qa:rebuild`,
`generate-dashboards.mjs` — and amending the commit with the result.

The reasoning matters more than the mechanic. These nine files have no authored
content: they are projections of the records around them. Hand-merging the hunks
is the tempting move and it is the wrong one, because it produces an index that
matches **neither** branch's record set — it looks resolved, validates as
well-formed markdown, and is silently wrong until someone counts. Taking one side
and regenerating guarantees the index is a true projection of the merged record
set, and the validators then prove it: `backlog:check` reports 380 records with 0
structural errors, which is my 54 plus the other session's, not a hand-picked
subset of either.

**What choosing the other side would have lost:** taking *my* side would have
dropped the concurrent session's BUG-1950, BUG-1951, BUG-1986 and their
SESSION-0069 closure from every index — the records would still exist as files
but would be invisible to `backlog:check`, the dashboards and the Obsidian graph,
which is precisely the failure mode where a record is filed and never seen again.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-29-starter-plan-e2e-eb457d9.md`](../../qa/runs/2026-08-29-starter-plan-e2e-eb457d9.md) — verdict **FAIL**. Three of the seven capabilities Starter sells cannot be delivered as shipped, and the plan does not withhold the five it does not sell. |
| **Bug IDs** | 46 created, 0 closed: BUG-1952 – BUG-1970, BUG-1974, BUG-1976 – BUG-1981, BUG-2003 – BUG-2017, BUG-2026, BUG-2043 – BUG-2046. Ten are release-blocking; all carry an Architect disposition and none is `TRIAGE_REQUIRED`. |
| **Backlog Items** | 8 created: ITEM-0104 – ITEM-0111. |

## CI

| | |
|---|---|
| **CI Run ID** | `33228598251` |
| **CI Result** | **PASS**, read on `ee69f49f` — the exact SHA that was ref-pushed to `develop`, not an earlier commit on the branch. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run in the task worktree with `HEAD == origin/develop == ee69f49f`, i.e. against
the integrated result, not the pre-rebase branch:

```
npm run backlog:check       Backlog indexes are current — 380 record(s), 0 structural errors.
npm run sessions:check      Session records valid and indexes current — 68 record(s).
npm run tasks:check         Task records valid and indexes current — 27 task(s).
npm run qa:check            QA records valid and indexes current — 21 plan(s), 244 scenario(s),
                            106 declared gap(s).
npm run validate:framework  Framework validation passed — 4410 checks.
npm run test:runtime-schema pass, 0 failed, 0 skipped, 0 todo
npm run knowledge:verify    OBSIDIAN_SYNC_STATUS = PASS
```

The first `validate:framework` after filing this record failed on two checks —
stale dashboards, and this file's own unresolved placeholders. Both were expected: the
history record is itself a graph node, so it changes the dashboards, and the
validator deliberately refuses a history record filed before its evidence exists.
Regenerating the dashboards and completing these sections cleared both.

**Not run, and why:** `lint`, `check-types`, `build`, the Jest suites and the
Playwright e2e suites. This task changed no source file — the entire diff is
under `docs/` — so those suites would re-prove the concurrent session's code, not
this task's output. The `CI required gate` on `ee69f49f` ran them regardless and
passed.

## Release / Deployment Impact

None — not deployed. `main` was never touched (`MAIN_CHANGE_STATUS = UNTOUCHED`),
no migration exists, and nothing here reaches an environment. Rollback class:
trivial — reverting the single commit removes records and documentation only.

Note the direction of travel: the *findings* concern production and several are
release-blocking for the Starter plan, but this task ships no fix. It is the
input to that work, not the work.

## Knowledge Capture

Three new documents under `docs/knowledge/`, plus inbound cross-links from four
existing notes so none is an orphan:

| File | Category | What it answers |
|---|---|---|
| `docs/knowledge/architecture/settings-and-configuration.md` | architecture | The six settings stores and their boundaries, 591 catalog keys across 13 categories, the four-layer resolution order, both caches, and seven traps — including that 246 keys have no reader and 230 of those are still editable in the UI |
| `docs/knowledge/modules/leave-attendance-approvals.md` | module | Setup prerequisites, state machines, endpoints and fragilities for the three modules; corrected with this run's live findings — the approval router needs every chain rule to resolve, and no accrual engine exists |
| `docs/knowledge/product/starter-plan-scope.md` | product | What Starter grants, how entitlement resolves, and the three holes in the only gate |

Each was trimmed from a much longer investigation report into an agent-readable
reference and carries a verified-at line, so a future agent retrieves the answer
instead of re-deriving it. The settings document was published only after an
adversarial verification pass corrected it — 8 mismatched key pairs, not the 9
originally claimed.

## Obsidian Sync

`npm run knowledge:sync` ran and wrote **98 files**; 899 were already current and
6 were skipped as empty by the empty-note policy. `npm run knowledge:verify` then
returned `OBSIDIAN_SYNC_STATUS = PASS` — 997 graph nodes, **0 orphans**, 0 parity
diffs, 0 unresolved or semantic link errors, 0 status or node-type mismatches.

Worth recording: before the sync, `knowledge:verify` reported 114 problems and a
single `GRAPH_ORPHAN`. All 114 were vault-parity failures against an unmerged
branch, and the orphan was `docs/tasks/TASK-0024-…` from another session — it
resolved on sync rather than needing an edit. Nothing in another session's
finalised records was touched to make the check pass.

## Cleanup

- Task worktree `D:/My Work/hrm-dijipeople/dijipeople-starter-qa` and the local
  branch `agent/starter-plan-e2e-qa` are removed immediately after this commit is
  integrated, using `npm run worktree:remove` — **never** `git worktree remove`,
  which follows the `node_modules` junction and has previously deleted thousands
  of tracked files out of the user's primary checkout.
- The primary checkout `D:/My Work/hrm-dijipeople/DijiPeople` was never entered
  for writing. It carried exactly one dirty path at the start (`.mcp.json`,
  another session's in-flight change) and carries the same one at the end;
  `PRIMARY_WORKTREE_STATUS = DIRTY_OTHER_SESSION_OWNED`, unchanged by this task.
- Two stray artifacts the Playwright MCP browser wrote into the primary checkout
  root (`settings-map.json`, `demo-dashboard-final.png`) were removed when
  spotted, and the `.playwright-mcp/` output directory was emptied.
- SESSION-0070 is closed and its record set to `STATUS: COMPLETE`.
- **Left deliberately in place on the production demo tenant**, because the owner
  asked for a tenant they can demo from: the seeded demo data, and three
  configuration changes without which leave cannot be demonstrated at all
  (`Annual Leave.consumesBalance = false`, and both seeded leave approval
  matrices deactivated in favour of one resolvable rule). Every one is listed
  with its id and its exact revert step in the session hand-off.
