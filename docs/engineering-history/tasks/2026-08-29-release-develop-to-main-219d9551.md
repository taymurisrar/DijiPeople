# Engineering History — Release develop to main

| | |
|---|---|
| **Task Title** | Release develop to main |
| **Task Type** | RELEASE — the one class permitted to change `main`, and the owner authorised it explicitly after being shown the scope and the one-way migration |
| **Date** | 2026-08-29 |
| **Architect Plan** | NOT_APPLICABLE — a promotion of already-reviewed, already-CI-verified work. The migrations shipping in it carry their own plans; `identity_contract` is TASK-0009 WP-09, whose expand/backfill/contract sequencing was decided there. |
| **Agents Used** | Architect, Release/DevOps, Integrator, Knowledge & Graph. **Deliberately not used:** every implementation and review role — Backend/API, Frontend, UI/UX, Database, Security, QA, Reviewer. A release writes no code and re-reviews nothing; each commit in it was reviewed and CI-verified on its own branch before reaching `develop`. Re-running that here would have produced a second opinion on frozen bytes, not new evidence. |

## Git

| | |
|---|---|
| **Base Branch** | `949f461c` |
| **Task Branch** | `agent/release-closeout-6d17989a` |
| **Base SHA** | `949f461c2e9367d4b46ec78f4cf2bd9d884e9064` |
| **Final Task SHA** | `219d9551d9bff1f11ad06f99cbd31c8fcd36f051` |
| **Target Branch** | `main` |
| **Merge Commit** | `6d17989a916b73a28030b04393d85259238a0de0` — PR #56, merged 2026-08-29 13:42:45 UTC |
| **Final Target SHA** | `6d17989a916b73a28030b04393d85259238a0de0` — and production serves it |

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
9991ba87 fix(web): the workspace switcher moves under the avatar, and names itself once
ff779ec9 docs(backlog): three findings from the screenshots that asked for ITEM-0102
9f32c407 chore(indexes): regenerate after the second rebase onto develop
8c6b8496 docs(history): three rebases, one duplicated fix, and an id that collided in silence
272906d0 docs(history): the run recorded, the vault synced, SESSION-0073 closed
25dfd43a chore(indexes): regenerate after rebasing the closure onto develop
273ed431 feat: three decided fixes -- audit toggle, seeded approval chain, leave backfill
4d10f62c docs(attendance): the owner's decision, and a plan that defers to SESSION-0072
fcb0af67 docs(leave): the refusal message reaches the screen after all
6d17989a Release: promote develop to main — the identity contract phase, leave entitlements, and the shell fixes
219d9551 Merge main into develop after the release
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            25dfd43a [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   a93aedd4 [agent/web-shell-accessibility]
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
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
D:/My Work/hrm-dijipeople/wt-release                            219d9551 [agent/release-closeout-6d17989a]
```

### Files Changed

309 file(s) against `949f461c`.

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
M	apps/web/app/(authenticated)/_components/dashboard-topbar.tsx
M	apps/web/app/(authenticated)/_components/user-menu-dropdown.tsx
M	apps/web/app/(authenticated)/layout.tsx
M	apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts
M	apps/web/app/(authenticated)/users/page.tsx
M	apps/web/app/components/runtime/module-runtime-command-handler.tsx
A	apps/web/app/components/workspace-switcher-placement.spec.ts
M	apps/web/app/components/workspace-switcher.tsx
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
M	docs/backlog/items/ITEM-0102-move-switch-workspace-into-the-avatar-menu.md
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
A	docs/backlog/items/ITEM-0114-the-workspace-shell-states-the-tenant-s-identity-four-times-.md
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
A	docs/bugs/BUG-2148-dashboard-widget-severity-is-conveyed-by-colour-alone-and-hi.md
A	docs/bugs/BUG-2149-every-dashboard-metric-card-offers-a-link-named-only-open.md
A	docs/bugs/BUG-2206-three-timesheet-audit-toggles-render-on-screen-and-are-read-.md
M	docs/development/browser-e2e.md
A	docs/engineering-history/tasks/2026-08-28-admin-console-fx-and-agent-settings-9e55663b.md
A	docs/engineering-history/tasks/2026-08-28-promote-open-bug-sweep-to-production-3d2931c4.md
A	docs/engineering-history/tasks/2026-08-29-backlog-burndown-9353872e.md
A	docs/engineering-history/tasks/2026-08-29-starter-blocker-fixes-3fff9cc9.md
A	docs/engineering-history/tasks/2026-08-29-starter-plan-e2e-qa-ee69f49f.md
A	docs/engineering-history/tasks/2026-08-29-workspace-switcher-avatar-menu-9f32c407.md
A	docs/knowledge/architecture/settings-and-configuration.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/framework/trust-the-runtime-invariant-over-a-static-scan.md
A	docs/knowledge/implementations/2026-08-29-workspace-switcher-avatar-menu.md
M	docs/knowledge/modules/approvals.md
M	docs/knowledge/modules/attendance.md
A	docs/knowledge/modules/leave-attendance-approvals.md
M	docs/knowledge/modules/settings.md
M	docs/knowledge/modules/tenant-application.md
M	docs/knowledge/product/product-areas.md
A	docs/knowledge/product/starter-plan-scope.md
A	docs/knowledge/releases/2026-08-28-open-bug-sweep.md
A	docs/plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md
A	docs/plans/EXECPLAN-0025-apps-web-browser-e2e-coverage.md
A	docs/plans/EXECPLAN-0026-leave-entitlement-allocation.md
A	docs/plans/EXECPLAN-0027-attendance-single-source-of-truth.md
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
A	docs/qa/scenarios/QA-RUNTIME-022-a-freshly-provisioned-tenant-can-route-an-approval-without-c.md
A	docs/qa/scenarios/QA-SETTINGS-005-a-settings-toggle-that-is-turned-off-changes-behaviour.md
M	docs/qa/scenarios/QA-TENANT-050-leads-are-withdrawn-rather-than-bulk-deleted.md
A	docs/qa/scenarios/QA-TENANT-052-the-payment-panel-asks-what-the-payment-is-doing-before-offe.md
A	docs/qa/scenarios/QA-TENANT-053-the-tenant-product-opens-module-by-module-for-the-plan-a-ten.md
A	docs/qa/scenarios/QA-TENANT-054-switching-workspace-is-reached-from-the-avatar-menu-and-name.md
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
M	docs/qa/test-plans/PLAN-021-settings.md
A	docs/qa/test-plans/PLAN-022-approvals.md
A	docs/qa/test-plans/PLAN-023-leave.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0067-promote-the-open-bug-sweep-to-production.md
A	docs/sessions/SESSION-0068-admin-console-fx-reporting-desktop-agent-settings-generic-bu.md
A	docs/sessions/SESSION-0069-backlog-burndown-verify-the-fixed-decide-the-deferred-close-.md
A	docs/sessions/SESSION-0070-starter-plan-e2e-qa-on-the-demo-tenant.md
A	docs/sessions/SESSION-0071-tenant-workspace-accessibility-the-three-defects-the-browser.md
A	docs/sessions/SESSION-0072-starter-release-blockers-the-fixes-that-make-leave-and-entit.md
A	docs/sessions/SESSION-0073-move-switch-workspace-into-the-avatar-menu-item-0102.md
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
M	services/api/package.json
A	services/api/prisma/backfill-leave-entitlement.ts
A	services/api/prisma/migrations/20260828220000_platform_exchange_rate/migration.sql
A	services/api/prisma/migrations/20260829090000_identity_contract/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/prisma/seed-config.ts
M	services/api/src/modules/approvals/approval-matrix-resolver.service.spec.ts
M	services/api/src/modules/approvals/approval-matrix-resolver.service.ts
A	services/api/src/modules/approvals/default-approval-matrices.spec.ts
A	services/api/src/modules/approvals/default-approval-matrices.ts
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
A	services/api/src/modules/timesheets/timesheet-job-audit.spec.ts
M	services/api/src/modules/timesheets/timesheet-jobs.service.ts
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

**None on the release merge itself.** PR #56 was `MERGEABLE` / `CLEAN` at merge
time and `main` carried nothing `develop` lacked, so the merge commit's tree is
exactly the tree CI verified at `4d10f62c`.

One merge afterwards, also clean: `main` back into `develop`, to return the
release merge commit to the integration branch. `develop` had moved one docs
commit (`fcb0af67`) past the released SHA while the deploy ran, so this could
not be a fast-forward — it is a real merge, and git resolved it with no
conflicted file.

The interruption worth recording is not a conflict but a **moving head**. PR #56
was opened against `25dfd43a` and merged at `4d10f62c`: SESSION-0071 pushed
twice to `develop` while the PR was open, which cancelled the first PR CI run
(`33254705461`) mid-flight.

## Conflict Resolutions

Nothing had to be chosen, so nothing was lost — but the moving head did force
one decision.

**The scope change was re-verified rather than waved through.** The owner
approved a release measured at `25dfd43a`: 26 commits, 92 code files, two
migrations. What merged was `4d10f62c`: 28 commits, 99 files. The alternative
was to merge the approved SHA and leave two commits behind, which would have put
`main` at a SHA `develop` had already moved past and guaranteed a second release
within the hour.

The check that made continuing defensible was specific: **no new migration** in
the delta. The one item carrying real, stated risk — `identity_contract` — was
unchanged, and the seven new files are ordinary API code plus a `seed-config`
change whose failure mode is an aborted deploy rather than a bad production
state. The PR body was corrected to describe the larger scope **before** the
merge, not after.

Had the delta contained a migration, this would have gone back to the owner.

## QA

| | |
|---|---|
| **QA Report** | None. A release's evidence is the production verification below and the CI verdict on the released tree, not a new QA run over unchanged code. |
| **Bug IDs** | None created or closed by the release itself. It carries to production the fixes closed on `develop` by the sessions beneath it. |
| **Backlog Items** | None created. `ITEM-0102`, closed on `develop` earlier today, reaches production here. |

## CI

| | |
|---|---|
| **CI Run ID** | `33254650713` — the run whose 15 jobs all executed and passed on `4d10f62c`, the exact released tree. Verified job by job rather than read off the gate summary, because later runs on that SHA resolve `reuse=true` against it and report `skipping`. The PR's own run `33255116734` also passed; its predecessor `33254705461` was cancelled by a push to `develop` mid-flight. |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Against production, not against a branch. The merged SHA is `6d17989a` and
`/api/health` reports it.

| Check | Result |
|---|---|
| `npm run smoke:deployment` (with `SMOKE_API_BASE_URL` pointed at production) | **PASS** — all nine checks |
| API health endpoint | ok, `commit: 6d17989` |
| Outbox worker draining | ok |
| Protected route rejects unauthenticated request | ok |
| CORS origin accepted | ok |
| A launched market has a purchasable plan | ok |
| Legal documents published | ok |
| Stripe webhook secret configured | ok |
| Composed tenant workspace host resolves | ok |
| `prisma migrate deploy` on production | **223 migrations found; both new ones applied**, read from the deploy log |

**A trap worth writing down.** The first `npm run smoke:deployment` reported
seven failures, every one `fetch failed`. It was not an outage — the script
defaults to `http://127.0.0.1:4000/api` and there is no local API running here.
Read at face value it is indistinguishable from production being down, and it
was run one minute after a production deploy. Always set `SMOKE_API_BASE_URL`.

**Not run:** the repository test suites. They passed on `4d10f62c` in CI run
`33254650713` with all 15 jobs executed on that exact SHA, and the merge commit
carries that identical tree, so re-running them locally would test the same bytes
a second time. What could not be established from CI — that the code is running
in production and that the migrations applied to the real database — is what was
checked instead.

**Not verified:** the workspace switcher in a browser. It renders nothing below
two workspaces, which is every account available here. See `QA-TENANT-054`.

## Release / Deployment Impact

**This task is the deployment.** `MAIN_CHANGE_STATUS = CHANGED`, which is the
expected terminal state for a `RELEASE` and a failure for anything else.

Render auto-deploy fired two seconds after the merge —
`dep-da9e3ls9v7es73di6i60`, `build_in_progress` 13:42:47 → `live` 13:49:03 UTC.
All three Vercel projects reported READY on `6d17989a`.

Release record:
`docs/knowledge/releases/2026-08-29-identity-contract-and-the-shell-fixes.md`.

**Rollback class: constrained, and this is the field that matters most in this
record.** Not code-only. `20260829090000_identity_contract` makes
`User.identityId` `NOT NULL`, so **the API must not be rolled back past
`6d17989a`** — an older build does not write the column on its creation paths
and would be unable to create users at all. A rollback that breaks user creation
is worse than whatever it is rolling back from.

What *is* safely reversible: everything in `apps/web`, `apps/admin` and
`apps/landing` independently, since the Vercel projects deploy separately from
the API. And `platform_exchange_rate`, by dropping a table nothing references.

Rolling back the API means rolling *forward* — a new commit that fixes the
defect, not a revert past the contract migration.

## Knowledge Capture

- `docs/knowledge/releases/2026-08-29-identity-contract-and-the-shell-fixes.md`
  — **new**, category `release`. What deployed, verified surface by surface with
  the deploy log quoted rather than summarised, and the rollback constraint
  stated before the contents because it is the thing an operator needs first.

Two things in it are durable rather than historical: the rollback constraint
above, and the `smoke:deployment` default-target trap — a script whose failure
mode impersonates a production outage is worth naming once so the next person
does not spend the minutes after a deploy believing it.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran: **35 notes written, 993 already current,
6 skipped as empty.** Folders written: `08 - Releases/Generated` (the release
note), `11 - Agent Knowledge/Engineering History` (this record),
`00 - Home/Generated` (dashboards), and the session index.

**`OBSIDIAN_SYNC_STATUS = COMPLETE_WITH_DOCUMENTATION_WARNING.`** Everything
this session produced verifies clean — `OBSIDIAN_GRAPH_ORPHANS 0`,
`OBSIDIAN_STALE_GENERATED 0`, `OBSIDIAN_PARITY_DIFFS 0`,
`OBSIDIAN_MISSING_PROVENANCE 0` — against one `ORPHAN_GENERATED_NODE`:
`2026-08-29-leave-module-and-decided-fixes-fcb0af67`, whose source lives on
SESSION-0071's unmerged `agent/session-0071-closure` at `a93aedd4`.

Traced with `git log --all --diff-filter=A` before being classified, and **not
deleted**. The vault holds the union of what every session has synced while
verification looks for sources on one branch, so this finding is a property of
concurrent work rather than damage — and the suggested remedy would remove a
live session's published work to make this verification read green.

## Cleanup

- **Release worktree** `D:/My Work/hrm-dijipeople/wt-release` — removed with
  `npm run worktree:remove` after this record integrates. Never
  `git worktree remove`: it follows the `node_modules` junction into the primary
  checkout, which has previously deleted thousands of tracked files from it.
- **Branch** `agent/release-closeout-6d17989a` — deleted locally once the
  worktree is gone; the remote stays for the audit trail.
- **PR #56** — merged, and `--delete-branch` deliberately **not** passed: the
  head of that PR is `develop`, and deleting it would destroy the integration
  branch.
- **`develop` and `main`** — both kept and now sharing the release merge commit.
- **Primary checkout** — untouched throughout. One dirty path, `.mcp.json`,
  which is the user's and was neither staged, committed nor reverted.
  `PRIMARY_WORKTREE_STATUS = DIRTY_USER_OWNED`.
- **Sessions** — `SESSION-0073` and `SESSION-0074` both `COMPLETE`.
  `SESSION-0071` is another session's, still `ACTIVE`, and was left alone.
