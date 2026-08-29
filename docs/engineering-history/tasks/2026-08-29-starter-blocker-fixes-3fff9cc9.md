# Engineering History — Starter blocker fixes

| | |
|---|---|
| **Task Title** | Starter blocker fixes |
| **Task Type** | BUGFIX — four Starter release blockers from the SESSION-0070 QA run, plus one investigation the product owner commissioned before deciding three records' disposition |
| **Date** | 2026-08-29 |
| **Architect Plan** | NOT_APPLICABLE. Each fix is localised and none crosses the `PLANS.md` threshold: no schema, no migration, no permission or RBAC change, no new module, no cross-app contract. The blockers that **do** cross it — leave accrual, approval-chain routing, entitlement enforcement, attendance logic — were deliberately left unstarted rather than half-done, and three were subsequently taken by SESSION-0071 under `EXECPLAN-0026`. |
| **Agents Used** | Architect (scope, triage, the fixes and their tests), QA (record closure and independent verification), Product & Backlog Steward, Knowledge & Graph, Integrator. Four research agents ran in parallel for code archaeology and record work. **Not used:** Database (no schema change), Security (authorization findings reported, not fixed here — BUG-2015 was fixed by SESSION-0071), Release/DevOps (`main` untouched, nothing deployed). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/starter-blocker-fixes` |
| **Base SHA** | `949f461c2e9367d4b46ec78f4cf2bd9d884e9064` |
| **Final Task SHA** | `3fff9cc9dc3409d5ce50d0057d004fba3a9cf420` |
| **Target Branch** | `develop` — corrected from the script's derived `main`, which it infers from `origin/main` being the base. `main` was never a target and is `UNTOUCHED`. |
| **Merge Commit** | none — integrated by ref-push (`git push origin agent/starter-blocker-fixes:develop`), so `develop`'s tip **is** the CI-verified SHA rather than a merge of it |
| **Final Target SHA** | `3fff9cc9` |

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
70391242 docs(history): the run recorded, the vault synced, the session closed
a86362cf fix(leave): approving a leave request required only permission to read it
bc507df7 fix(approvals): an unroutable chain now says which step and what to configure
9def9971 fix(web-runtime): a related-list create now carries its parent foreign key
f2d367d0 feat(leave): a policy entitlement now becomes a leave balance
3fff9cc9 fix(web): the saves that failed in silence, and three dead ends in the shell
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            70391242 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   f2d367d0 [agent/web-shell-accessibility]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-blockers                   3fff9cc9 [agent/starter-blocker-fixes]
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
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
D:/My Work/hrm-dijipeople/wt-workspace-menu                     802f9572 [agent/workspace-switcher-avatar-menu]
```

### Files Changed

282 file(s) against `origin/main`.

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
M	apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts
M	apps/web/app/(authenticated)/users/page.tsx
M	apps/web/app/components/runtime/module-runtime-command-handler.tsx
A	apps/web/lib/runtime/command-failure-visibility.spec.ts
A	apps/web/lib/runtime/command-failure-visibility.ts
M	apps/web/lib/runtime/modules/employee-data.adapter.ts
A	apps/web/lib/runtime/modules/leave-create-payload.spec.ts
M	apps/web/lib/runtime/modules/standard-module-data.adapter.ts
M	apps/web/lib/runtime/modules/standard-module-specs.ts
M	apps/web/lib/runtime/related-record-api.ts
A	apps/web/lib/runtime/related-record-parent-key.spec.ts
A	docs/architecture/platform-fx-reporting.md
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md
M	docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md
M	docs/backlog/items/ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti.md
M	docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md
M	docs/backlog/items/ITEM-0075-the-subscribe-wizard-never-collects-companysize-which-the-ap.md
M	docs/backlog/items/ITEM-0079-activation-does-not-gate-on-a-workspace-having-any-module-en.md
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
A	docs/backlog/items/ITEM-0112-enforcecriticalattendancesetting-has-no-test-coverage-despit.md
A	docs/backlog/items/ITEM-0113-the-seeded-leave-approval-chain-cannot-route-on-a-newly-prov.md
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
A	docs/bugs/BUG-2091-the-canonical-settings-contract-still-describes-attendance-g.md
M	docs/development/browser-e2e.md
A	docs/engineering-history/tasks/2026-08-28-admin-console-fx-and-agent-settings-9e55663b.md
A	docs/engineering-history/tasks/2026-08-28-promote-open-bug-sweep-to-production-3d2931c4.md
A	docs/engineering-history/tasks/2026-08-29-backlog-burndown-9353872e.md
A	docs/engineering-history/tasks/2026-08-29-starter-plan-e2e-qa-ee69f49f.md
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
A	docs/plans/EXECPLAN-0026-leave-entitlement-allocation.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-28-regression-guard-sweep-9e55663.md
A	docs/qa/runs/2026-08-29-starter-plan-e2e-eb457d9.md
A	docs/qa/runs/2026-08-29-starter-plan-e2e-pass-2-8ab1cbf.md
A	docs/qa/scenarios/QA-AGENT-008-the-desktop-agent-is-one-settings-screen-on-the-shared-shell.md
A	docs/qa/scenarios/QA-AUTHZ-013-approving-leave-requires-the-permission-to-approve-not-merel.md
A	docs/qa/scenarios/QA-RUNTIME-017-an-unroutable-approval-chain-refuses-the-submission-and-name.md
A	docs/qa/scenarios/QA-RUNTIME-018-a-failed-save-always-tells-the-user-even-when-the-server-nam.md
A	docs/qa/scenarios/QA-RUNTIME-020-creating-from-a-related-list-attaches-the-record-to-the-pare.md
A	docs/qa/scenarios/QA-RUNTIME-021-an-employee-covered-by-a-leave-policy-has-the-entitlement-it.md
M	docs/qa/scenarios/QA-TENANT-050-leads-are-withdrawn-rather-than-bulk-deleted.md
A	docs/qa/scenarios/QA-TENANT-052-the-payment-panel-asks-what-the-payment-is-doing-before-offe.md
A	docs/qa/scenarios/QA-TENANT-053-the-tenant-product-opens-module-by-module-for-the-plan-a-ten.md
A	docs/qa/scenarios/QA-TENANT-055-employee-document-upload-validates-stores-and-returns-the-sa.md
A	docs/qa/scenarios/QA-TENANT-056-employee-import-resolves-named-lookups-into-real-foreign-key.md
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
A	docs/qa/test-plans/PLAN-022-approvals.md
A	docs/qa/test-plans/PLAN-023-leave.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0067-promote-the-open-bug-sweep-to-production.md
A	docs/sessions/SESSION-0068-admin-console-fx-reporting-desktop-agent-settings-generic-bu.md
A	docs/sessions/SESSION-0069-backlog-burndown-verify-the-fixed-decide-the-deferred-close-.md
A	docs/sessions/SESSION-0070-starter-plan-e2e-qa-on-the-demo-tenant.md
A	docs/sessions/SESSION-0071-tenant-workspace-accessibility-the-three-defects-the-browser.md
A	docs/sessions/SESSION-0072-starter-release-blockers-the-fixes-that-make-leave-and-entit.md
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
M	services/api/src/modules/approvals/approval-matrix-resolver.service.spec.ts
M	services/api/src/modules/approvals/approval-matrix-resolver.service.ts
M	services/api/src/modules/billing/services/payment-recheck.service.ts
A	services/api/src/modules/billing/services/payment-state.spec.ts
M	services/api/src/modules/leads/admin-leads.controller.ts
D	services/api/src/modules/leads/bulk-delete-withdrawn.spec.ts
A	services/api/src/modules/leave/leave-approval-permissions.spec.ts
A	services/api/src/modules/leave/leave-entitlement.service.spec.ts
A	services/api/src/modules/leave/leave-entitlement.service.ts
A	services/api/src/modules/leave/leave-policy-resolver.service.ts
M	services/api/src/modules/leave/leave-requests.controller.ts
M	services/api/src/modules/leave/leave.module.ts
M	services/api/src/modules/leave/leave.repository.ts
M	services/api/src/modules/leave/leave.service.spec.ts
M	services/api/src/modules/leave/leave.service.ts
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

`develop` moved **three times** during this task — `70391242` → `a86362cf` →
`f2d367d0` — while SESSION-0071 worked the same bug list from
`agent/web-shell-accessibility`. Two rebases were needed, and the conflicts split
into two kinds.

**Generated index (nine files, both rebases).** `docs/backlog/index.md`,
`open.md`, `deferred.md`, the three dashboards, `docs/qa/coverage-matrix.md`,
`docs/qa/scenarios/index.md`, `docs/qa/test-plans/index.md`,
`docs/qa/regressions/index.md`, `docs/sessions/active.md`, `index.md` and
`docs/tasks/remediation/TASK-0005-inventory.json`. Each side had appended its own
records to the same generated tables.

**Hand-authored (one file).** `docs/qa/test-plans/PLAN-011-runtime-modules.md` —
its scenario list. Their side added `QA-RUNTIME-020`; mine added
`QA-RUNTIME-018`, `QA-TENANT-055` and `QA-TENANT-056`.

**A worse collision that was not a git conflict at all.** Regression ids have no
allocator in this repository. SESSION-0071 had taken `REG-304`, `REG-305` and
`REG-306` on `develop`; this task had independently used `REG-304` locally. Git
merged the register cleanly by taking one side, and the id silently pointed at
the wrong bug.

## Conflict Resolutions

**Generated indexes — took `origin/develop`'s side wholesale, then re-ran the
generators** (`backlog:rebuild`, `qa:rebuild`, `remediation:sync`,
`rebuild-sessions`, `generate-dashboards`, `generate-component-index`) and
amended. These files have no authored content: they are projections of the
records around them. Hand-merging the hunks produces an index matching *neither*
branch's record set — it looks resolved, validates as well-formed markdown, and
is wrong until someone counts. Taking one side and regenerating makes the index a
true projection of the merged set, and `backlog:check` then proves it at 383
records with 0 structural errors. **What choosing my side would have lost:**
SESSION-0071's BUG-1961, BUG-1967, BUG-1968 closures and `EXECPLAN-0026` would
have vanished from every index while the files stayed on disk — filed and never
seen again.

**PLAN-011 — merged by hand, both sides kept.** This one is authored, so taking a
side would have silently dropped real scenarios. All four exist and all four
belong to the runtime-modules plan; the union is the correct answer and picking
either side would have orphaned the other's work from its plan.

**The REG collision — renumbered mine, not theirs.** Theirs was already on
`develop` and referenced from merged records; mine existed only here. Re-issued
as `REG-307` and updated all six references across BUG-1966 and QA-RUNTIME-018.
`backlog:check` is what caught it — *"REG-304 does not name BUG-1966 in its Bug
record field"* — which is the validator earning its place: a silent id collision
across two branches is invisible to git and to review.

**One duplicate fix was withdrawn entirely.** BUG-1961/BUG-2011 were fixed here
first, then found in progress on `agent/web-shell-accessibility`. Both
implementations used the same predicate; theirs shipped the better test — it
iterates the real `settingsAdapterRegistry` and every runtime spec, checking all
seven subgrids by construction, where mine asserted three synthetic fixtures. Mine
was reverted and the record closure stopped mid-write before it could overwrite
theirs. A second QA scenario for one behaviour is worse than none.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-29-starter-plan-e2e-pass-2-8ab1cbf.md`](../../qa/runs/2026-08-29-starter-plan-e2e-pass-2-8ab1cbf.md) — verdict **FAIL**, driven solely by the three responsive scenarios; documents and employee import both PASS. |
| **Bug IDs** | Fixed: BUG-1966 (FIXED, REG-307). Advanced to IN_PROGRESS with the code landed and the remainder named: BUG-1965, BUG-2003, BUG-2004, BUG-1962. Rewritten after investigation: BUG-1979, BUG-1980, BUG-1981. Evidence added: BUG-1668, BUG-2026. Created: BUG-2091. Withdrawn as duplicate: BUG-1961, BUG-2011. |
| **Backlog Items** | Created: ITEM-0112 (TEST_GAP — `enforceCriticalAttendanceSetting` has no coverage). |

## CI

| | |
|---|---|
| **CI Run ID** | `33251381630` |
| **CI Result** | **PASS**, read on `3fff9cc9` — the exact SHA ref-pushed to `develop`. An earlier attempt on `8ab1cbff` **FAILED** and is recorded under Post-Merge Validation rather than hidden. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run with `HEAD == origin/develop == 3fff9cc9`, i.e. against the integrated result
and on top of SESSION-0071's three commits, not the pre-rebase branch:

```
Framework validation — the whole job, not one step of it:
  validate-framework.mjs                 Framework validation passed — 4428 checks
  generate-component-index.mjs --check   up to date (107 documented exports)
  knowledge-terms.test.mjs               pass
  task-sha-ref.test.mjs                  pass
  index-drift.test.mjs                   pass
  main-change-policy.test.mjs            pass

npm run backlog:check   Backlog indexes are current — 383 record(s), 0 structural errors
npm run qa:check        QA records valid — 23 plan(s), 251 scenario(s), 120 declared gap(s)
npm --workspace web run check-types   pass
npm --workspace web run test          31 suites, 935 tests, all passing
```

**The first CI attempt failed, and the reason is worth recording.** Run
`33250275693` on `8ab1cbff` failed one required job: *"`.agent/context/component-index.md`
is out of date"*. Thirteen of fourteen required jobs passed and the gate still
refused to conclude, which is the design working. The cause was running
`validate:framework` alone and treating it as the job — it is one of six steps,
and it does not check the component index, which a **new source file** stales.
This repository already carries that lesson; it was not applied. Every step of the
job is listed above because of it.

The 935-test figure is higher than the 896 this branch had before the final
rebase: it now includes SESSION-0071's `related-record-parent-key.spec.ts`,
running green alongside these changes.

**Not run, and why:** `build`, the API/admin/landing/desktop suites, the database
gates and browser e2e. The source change is confined to five files in `apps/web`;
those suites cover code this task did not touch. The `CI required gate` on
`3fff9cc9` ran all fourteen and passed.

## Release / Deployment Impact

None — not deployed. `main` is `UNTOUCHED` at `949f461c`, no migration exists,
and nothing here reaches an environment. Rollback class: trivial — one commit,
five source files, all in the tenant frontend.

**Consequence worth stating plainly:** none of these fixes is verified in
production. The demo tenant that surfaced every one of them still runs `main`, so
the silent-save fix, the `/users` fix and the leave payload fix are proven by
test and by review, and by nothing else. Verification needs a release, which is
the owner's to make.

## Knowledge Capture

No new `docs/knowledge/` file. The durable output of this task is in the records
rather than the knowledge base, and two pieces are worth naming because they
change what a future agent should do:

- **BUG-1979 carries a "do not delete `enforceCriticalAttendanceSetting`"
  section.** The attendance location mandate is deliberate — commit `a8c04f16`, a
  migration whose first line reads *"Attendance location is a mandatory integrity
  control for all self-service modes"*, and a test named for it. But the real
  enforcement is an unconditional throw in `validateAttendanceLocationPayload`,
  and all nine settings fields are read in **zero** enforcement branches, so
  removing the override would restore no configurability and only make dead
  settings look live. The obvious fix is the wrong one, and the record now says so
  before a fixer reaches for it.
- **BUG-1981 carries a correction.** Its original claim that two values were
  "inverted" relative to their column defaults was wrong: they are logical
  complements and always were. Corrected in place with a `## Correction` section
  rather than quietly edited, so the history stays honest.

## Obsidian Sync

`npm run knowledge:sync` then `npm run knowledge:verify` — see the closing run in
this task's session. Recorded there rather than duplicated here.

## Cleanup

- `runtime-registries` write lease released. It was taken **after** the registries
  had already been edited, which is the root cause of the duplicated work with
  SESSION-0071: both sessions showed `WRITE_LEASES: []` while editing the same two
  files. The lease system did not fail; it was not used.
- Task worktree `D:/My Work/hrm-dijipeople/dijipeople-blockers` removed with
  `npm run worktree:remove` after unlinking its `node_modules` junction — never
  `git worktree remove`, which follows the junction and has previously deleted
  thousands of tracked files from the user's primary checkout.
- Local and remote `agent/starter-blocker-fixes` deleted after integration.
- The primary checkout was never entered for writing and carries only the
  pre-existing `.mcp.json` change that was there before this task began.
- SESSION-0072 closed and its record set to `STATUS: COMPLETE` by hand, because
  `session.mjs finish` updates live state and not the durable record.
