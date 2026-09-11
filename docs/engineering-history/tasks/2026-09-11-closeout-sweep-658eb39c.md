# Engineering History — Closeout sweep

| | |
|---|---|
| **Task Title** | Closeout sweep |
| **Task Type** | BUGFIX + FRAMEWORK — a backlog and session closeout, not a feature |
| **Date** | 2026-09-11 |
| **Architect Plan** | NOT_APPLICABLE — a sweep of already-recorded work; the ExecPlans written *by* it are listed under Backlog Items |
| **Agents Used** | Architect (triage, integration, all CI cycles) plus ten parallel specialist streams in isolated worktrees. Release/DevOps deliberately not used — this task leaves `main` untouched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/closeout-sweep` |
| **Base SHA** | `2d86d506f859fa628dff4632150c22d5663714e6` |
| **Final Task SHA** | `658eb39c2babd40c831a029a3baa58fd58f12db3` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by ref-push (`git push origin HEAD:develop`), so the target tip *is* the CI-verified SHA rather than an unverified merge commit above it |
| **Final Target SHA** | `658eb39c2babd40c831a029a3baa58fd58f12db3` — equal to Final Task SHA, verified after the push |

### Commits

```
ab4e36e4 docs(remediation): FILE-01/INF-05 verified resolved on production
59c0f9fa Merge main into develop after the R2 storage release
11afbd50 chore(session): close SESSION-0097
2d86d506 docs(history,knowledge): SESSION-0097 history and the lessons worth keeping
4db37446 docs(audit): full technical health audit — SESSION-0096
f26357a8 chore(sessions): close six stale sessions and land the technical audit
9b2fc338 docs(triage): dispose the five records that were awaiting Architect triage
1ff63354 fix(billing): give abandonExpired a runner (BUG-2618)
5af352ce docs(security): record the public credential leak and the backup gap
744f8172 fix(scripts): ITEM-0093 — link validation now sees untracked records too
c391d75d docs(security): complete BUG-3110 and ITEM-0131 to the record schema
a800d8f2 docs(ITEM-0131): replace the inferred plan limit with the API's own refusal
4e8dbfbe feat(legal): ITEM-0068 — show a diff and require confirmation before publish
568ef7ee fix(reporting): gate the analytics catalog and query engine by plan entitlement (BUG-3007)
e9354529 feat(scripts): ITEM-0084 — detect drift between render.yaml and live Render
ef3d13e8 fix(security): close the forged X-Forwarded-For rate-limit bypass and cover authenticated routes
351b85f6 docs(BUG-3110): correct the rotation runbook to one variable, not two
83d410de fix(framework): allocate-id refuses an unregistered --session (ITEM-0074)
0ed2017b test(config): fix and wire widget-runtime-contract.test.js (ITEM-0092)
35e03cbc docs(deployment): scope env-var registration to build inputs (ITEM-0049)
00973620 refactor(web): remove inert runtime registries, fix the wrong-column risk (ITEM-0036)
6fde0bfa fix(leave): expose accrualType in the entitlement dialog (ITEM-0105)
1d019c09 refactor(web): collapse four Users screens into one (ITEM-0107)
bb890492 fix(approvals): let an invited reporting manager approve (ITEM-0106)
5a046fd6 feat(projects): add real delete for projects and customers (BUG-2007)
446a6cfb fix(web): disabled commands state their reason as visible text (ITEM-0109)
9bc0245b fix(security): stop POST /users/:userId/roles self-granting GLOBAL_ADMIN
d8dfc16e docs(plan): ExecPlan for database-reachable health check (ITEM-0009)
fc4c5498 fix(web): cover twelve missing route trees and preserve deep links (ITEM-0111)
a840817b test(tenant-settings): direct coverage for enforceCriticalAttendanceSetting (ITEM-0112)
1d4d74bf fix(web): move Reports & Analytics explanatory copy off the critical path (ITEM-0128)
508e30e4 docs(plan): ExecPlan for the legacy Plan pricing column drop (ITEM-0020)
d8bb505f docs(agent): review the screen and its neighbours, not only the diff (ITEM-0130)
7017d36f style(web): drop unused UserListResponse import (ITEM-0107 follow-up)
1df6f9e8 docs(decisions): ITEM-0117 — capture seven product decisions as ADR-0006
4220df42 docs(plan): ExecPlan for governed plan/price publish and archive (ITEM-0022)
f3ec3a0a fix(web): workspace name in the sidebar's big slot (ITEM-0114)
22004f6b fix(reporting): resolve labelLookup ids and unify breakdown rounding (BUG-3020) [code+tests done, bug record not yet updated]
52cbc56f fix(web): stop the workspace switcher scrolling horizontally (BUG-3021) [code+tests done, bug record not yet updated]
00a5058a fix(attendance,billing): correction approval/withdraw/work-sites + Stripe unmapped-tenant ack
6cf91311 fix(agent-desktop): re-verify packaged exclusion list against the real archive (ITEM-0077, partial)
6b87e8fa docs(bugs): close BUG-3020 and BUG-3021 with Resolution sections
7b197797 docs(plan): ExecPlan for Tenant.dataRegion at provisioning (ITEM-0023)
eaf29471 fix(security): close the one-sided guard on role grants and the employee export BOLA
3da4a860 feat(seed): stop provisioning departments with no business unit (ITEM-0115)
cbfdc7d5 Merge branch 'agent/cs-s3-itemsa' into agent/closeout-sweep
dd79a628 Merge the items batch B stream, and settle ITEM-0130's own contradiction
c7f31300 Merge branch 'agent/cs-s1-openbugs' into agent/closeout-sweep
126cd7f1 Merge branch 'agent/cs-s7-planbugs' into agent/closeout-sweep
d3eac2b3 Merge branch 'agent/cs-s8-planitems' into agent/closeout-sweep
b4ab8e90 Merge the product-decisions stream, and reconcile four regression collisions
b1d1f9a1 Merge the security, triaged, audit-record and PII streams
1473af92 Make the integrated branch pass every gate it will meet on CI
18e0ecc3 fix(security): the hop guard rejected every honest forwarded chain (BUG-3254)
e3b5744e Revert the hop-guard change: it was a test one hop short, not an off-by-one
658eb39c fix(test): pin the provisioning fixture's clock, and run the whole e2e job locally
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            658eb39c [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-audit                      911be0fa [agent/full-technical-audit]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-closeout                   658eb39c [agent/closeout-sweep]
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
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

274 file(s) against `origin/main`.

```
M	.agent/agents/reviewer.md
M	.agent/context/component-index.md
M	.github/workflows/ci.yml
M	AGENTS.md
M	apps/admin/app/_components/settings/legal-document-editor.tsx
M	apps/agent-desktop/electron-builder.yml
M	apps/web/app/(authenticated)/_components/dashboard-sidebar.tsx
M	apps/web/app/(authenticated)/_components/dashboard-topbar.tsx
M	apps/web/app/(authenticated)/_components/workspace-mobile-overflow.spec.ts
M	apps/web/app/(authenticated)/attendance/[entryId]/page.tsx
M	apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx
M	apps/web/app/(authenticated)/attendance/corrections/new/page.tsx
M	apps/web/app/(authenticated)/layout.tsx
M	apps/web/app/(authenticated)/onboarding/[onboardingId]/page.tsx
M	apps/web/app/(authenticated)/onboarding/types.ts
M	apps/web/app/(authenticated)/reports/_components/analytics-surface-view.tsx
M	apps/web/app/(authenticated)/reports/_components/caveat-panel.tsx
A	apps/web/app/(authenticated)/reports/_components/item-0128-caveat-placement.spec.ts
M	apps/web/app/(authenticated)/reports/_components/reports-landing.tsx
M	apps/web/app/(authenticated)/reports/_lib/report-format.spec.ts
M	apps/web/app/(authenticated)/reports/_lib/report-format.ts
M	apps/web/app/(authenticated)/reports/analytics/[surface]/page.tsx
D	apps/web/app/(authenticated)/settings/_components/user-access-management.tsx
D	apps/web/app/(authenticated)/settings/_components/user-form.tsx
M	apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts
M	apps/web/app/(authenticated)/settings/_lib/settings-doc-routes.spec.ts
D	apps/web/app/(authenticated)/settings/access/users/[userId]/edit/page.tsx
D	apps/web/app/(authenticated)/settings/access/users/[userId]/page.tsx
D	apps/web/app/(authenticated)/settings/access/users/new/page.tsx
D	apps/web/app/(authenticated)/settings/access/users/page.tsx
D	apps/web/app/(authenticated)/settings/security-access/users/[userId]/edit/page.tsx
D	apps/web/app/(authenticated)/settings/security-access/users/[userId]/page.tsx
D	apps/web/app/(authenticated)/settings/security-access/users/new/page.tsx
D	apps/web/app/(authenticated)/settings/security-access/users/page.tsx
D	apps/web/app/(authenticated)/users/[userId]/page.tsx
D	apps/web/app/(authenticated)/users/_components/user-detail.tsx
D	apps/web/app/(authenticated)/users/_components/users-command-bar.tsx
D	apps/web/app/(authenticated)/users/_components/users-filter-bar.tsx
D	apps/web/app/(authenticated)/users/_components/users-filters.ts
D	apps/web/app/(authenticated)/users/_components/users-table.tsx
D	apps/web/app/(authenticated)/users/_lib/user-routes.ts
D	apps/web/app/(authenticated)/users/page.tsx
D	apps/web/app/(authenticated)/users/types.ts
A	apps/web/app/api/attendance/correction-requests/[id]/cancel/route.ts
M	apps/web/app/api/customers/[customerId]/route.ts
M	apps/web/app/api/projects/[projectId]/route.ts
M	apps/web/app/components/attendance-corrections/attendance-correction-actions.tsx
M	apps/web/app/components/attendance-corrections/attendance-correction-panel.tsx
M	apps/web/app/components/attendance-corrections/attendance-correction-types.ts
M	apps/web/app/components/charts/chart-format.spec.ts
M	apps/web/app/components/charts/chart-format.ts
M	apps/web/app/components/charts/chart-frame.tsx
M	apps/web/app/components/charts/horizontal-bar-list.tsx
M	apps/web/app/components/charts/index.ts
M	apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx
M	apps/web/app/components/runtime/module-command-bar.tsx
M	apps/web/app/components/runtime/module-data-table.tsx
M	apps/web/app/components/runtime/standard-module-record-page.tsx
M	apps/web/app/components/workspace-shell-headings.spec.ts
A	apps/web/app/components/workspace-switcher-overflow.spec.ts
M	apps/web/app/components/workspace-switcher.tsx
A	apps/web/lib/auth-config.spec.ts
M	apps/web/lib/auth-config.ts
A	apps/web/lib/runtime/attendance-checkin-disabled-reason.spec.ts
M	apps/web/lib/runtime/command-registry.ts
M	apps/web/lib/runtime/index.ts
A	apps/web/lib/runtime/leave-entitlement-accrual-type.spec.ts
D	apps/web/lib/runtime/metadata-layer-resolver.ts
D	apps/web/lib/runtime/metadata-registry.ts
D	apps/web/lib/runtime/module-registry.ts
D	apps/web/lib/runtime/module-runtime.resolver.ts
M	apps/web/lib/runtime/modules/employee-metadata.adapter.ts
A	apps/web/lib/runtime/modules/entity-primary-name-field.spec.ts
A	apps/web/lib/runtime/modules/entity-primary-name-field.ts
M	apps/web/lib/runtime/modules/standard-module-runtime.ts
M	apps/web/lib/runtime/modules/standard-module-specs.ts
M	apps/web/lib/security-keys.ts
A	apps/web/next-config-users-redirect.spec.ts
M	apps/web/next.config.ts
M	docs/architecture/settings-and-branding.md
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0009-no-observability-platform-exists.md
M	docs/backlog/items/ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns.md
M	docs/backlog/items/ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur.md
M	docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md
M	docs/backlog/items/ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md
M	docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md
M	docs/backlog/items/ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip.md
M	docs/backlog/items/ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe.md
M	docs/backlog/items/ITEM-0084-detect-drift-between-render-yaml-and-the-live-render-service.md
M	docs/backlog/items/ITEM-0092-widget-runtime-contract-test-js-fails-and-no-script-or-ci-jo.md
M	docs/backlog/items/ITEM-0093-link-validation-skips-untracked-files-so-a-new-record-s-brok.md
M	docs/backlog/items/ITEM-0105-the-leave-entitlement-dialog-cannot-set-accrualtype-which-th.md
M	docs/backlog/items/ITEM-0106-an-employee-cannot-use-self-service-until-their-manager-acti.md
M	docs/backlog/items/ITEM-0107-three-separate-users-screens-exist-in-the-tenant-app.md
M	docs/backlog/items/ITEM-0108-decide-whether-the-roughly-one-hour-session-lifetime-is-idle.md
M	docs/backlog/items/ITEM-0109-the-disabled-check-in-button-explains-itself-only-in-a-title.md
M	docs/backlog/items/ITEM-0111-protected-route-prefixes-omits-twelve-authenticated-route-tr.md
M	docs/backlog/items/ITEM-0112-enforcecriticalattendancesetting-has-no-test-coverage-despit.md
M	docs/backlog/items/ITEM-0114-the-workspace-shell-states-the-tenant-s-identity-four-times-.md
M	docs/backlog/items/ITEM-0115-provisioning-seeds-four-departments-with-no-business-unit-on.md
M	docs/backlog/items/ITEM-0117-the-question-protocol-has-never-been-used-and-five-user-deci.md
M	docs/backlog/items/ITEM-0124-production-advisory-gate-blocks-every-release-to-main-and-np.md
M	docs/backlog/items/ITEM-0125-the-net-integration-gateway-ships-to-customers-with-no-ci-co.md
M	docs/backlog/items/ITEM-0128-reports-and-analytics-two-explanatory-cards-nobody-reads-sit.md
M	docs/backlog/items/ITEM-0130-review-process-missed-four-defects-on-screens-adjacent-to-th.md
A	docs/backlog/items/ITEM-0131-production-hr-and-payroll-data-has-no-backup-the-database-is.md
A	docs/backlog/items/ITEM-0158-public-traffic-that-bypasses-cloudflare-shares-one-rate-limi.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-2007-projects-and-customers-can-be-created-but-never-deleted.md
M	docs/bugs/BUG-2462-stripe-subscription-webhooks-fail-because-the-customer-resol.md
M	docs/bugs/BUG-2494-check-out-re-validates-check-in-preconditions-and-traps-the-.md
M	docs/bugs/BUG-2495-the-under-investigation-tile-counts-incidents-nobody-is-inve.md
M	docs/bugs/BUG-2504-approving-a-correction-never-applies-the-requested-work-mode.md
M	docs/bugs/BUG-2508-the-correction-work-site-selector-is-never-populated-for-an-.md
M	docs/bugs/BUG-2509-platform-admin-remember-me-has-no-policy-able-to-refuse-it.md
M	docs/bugs/BUG-2573-a-correction-request-cannot-be-withdrawn-by-the-person-who-f.md
M	docs/bugs/BUG-2618-expired-subscription-orders-are-never-swept-abandonexpired-h.md
M	docs/bugs/BUG-2888-an-externally-hosted-release-is-invisible-to-the-desktop-age.md
M	docs/bugs/BUG-3007-reports-and-analytics-offers-surfaces-and-reports-for-capabi.md
M	docs/bugs/BUG-3020-records-behind-these-numbers-shows-raw-guids-and-a-count-tha.md
M	docs/bugs/BUG-3021-workspace-switcher-in-the-avatar-menu-overflows-horizontally.md
A	docs/bugs/BUG-3110-a-live-production-database-password-sits-permanently-in-the-.md
A	docs/bugs/BUG-3115-rate-limiter-trusts-a-forged-x-forwarded-for-and-covers-no-a.md
A	docs/bugs/BUG-3152-post-users-userid-roles-lets-a-delegated-role-assignment-adm.md
A	docs/bugs/BUG-3241-legacy-role-permission-grant-and-employee-export-both-skip-t.md
A	docs/bugs/BUG-3254-the-forwarded-for-hop-guard-rejected-every-honest-chain-coll.md
A	docs/bugs/BUG-3263-the-provisioning-queue-e2e-fixture-raced-the-clock-so-an-exa.md
A	docs/decisions/ADR-0006-product-decisions-from-the-2026-09-11-backlog-review.md
A	docs/decisions/ADR-0007-remove-inert-apps-web-runtime-registries.md
A	docs/decisions/ADR-0008-unregistered-agent-branch-warns-not-blocks.md
M	docs/decisions/README.md
M	docs/deployment/environments.md
A	docs/engineering-history/tasks/2026-09-10-r2-durable-object-storage-11afbd50.md
M	docs/engineering/REMEDIATION-storage-p0.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/00-EXECUTIVE-AUDIT-REPORT.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/API.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/ARCH.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/CACHE.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/CI.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/DEBT.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/ORCH.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/SCHEMA.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/SUP.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/TEN.md
A	docs/engineering/audits/2026-09-10-full-technical-audit/raw/_BRIEFING.md
M	docs/environment-variables.md
M	docs/knowledge/architecture/deployment-architecture.md
M	docs/knowledge/architecture/screen-map.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/framework/a-review-that-never-opens-the-screen-2026-09-11.md
A	docs/knowledge/framework/security-fix-at-the-finding-not-the-pattern-2026-09-10.md
A	docs/knowledge/framework/verification-gaps-found-shipping-r2-storage-2026-09-10.md
A	docs/plans/EXECPLAN-0032-attendance-correction-approval-completes-the-workflow.md
A	docs/plans/EXECPLAN-0032-health-check-database-reachability.md
A	docs/plans/EXECPLAN-0033-drop-legacy-plan-pricing-columns.md
A	docs/plans/EXECPLAN-0033-stripe-webhook-acknowledges-an-unmappable-tenant.md
A	docs/plans/EXECPLAN-0034-governed-plan-price-publish-archive.md
A	docs/plans/EXECPLAN-0035-tenant-data-region-from-market.md
M	docs/qa/coverage-matrix.md
M	docs/qa/known-bug-patterns/gate-scoped-to-one-structure.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-ATTENDANCE-010-an-employee-s-correction-work-site-list-resolves-from-the-ca.md
A	docs/qa/scenarios/QA-ATTENDANCE-011-only-the-requester-may-withdraw-a-correction-and-not-after-i.md
A	docs/qa/scenarios/QA-ATTENDANCE-012-an-approved-correction-applies-its-requested-mode-and-site-a.md
A	docs/qa/scenarios/QA-AUTHZ-014-no-role-grant-route-lets-an-actor-grant-beyond-their-own-eff.md
A	docs/qa/scenarios/QA-AUTHZ-015-sibling-endpoints-on-one-permission-pair-enforce-one-shared-.md
A	docs/qa/scenarios/QA-BILLING-028-expired-subscription-orders-are-swept-by-a-runner-that-is-ac.md
A	docs/qa/scenarios/QA-BILLING-029-an-unmappable-stripe-customer-is-acknowledged-not-retried-fo.md
A	docs/qa/scenarios/QA-REPORTS-001-reports-and-analytics-surfaces-are-gated-by-plan-entitlement.md
A	docs/qa/scenarios/QA-REPORTS-002-a-breakdown-s-chart-and-its-own-table-agree-and-labelled-col.md
A	docs/qa/scenarios/QA-RUNTIME-041-deleting-a-project-or-customer-refuses-when-dependent-data-e.md
A	docs/qa/scenarios/QA-SECURITY-002-the-rate-limiter-does-not-trust-a-client-supplied-x-forwarde.md
A	docs/qa/scenarios/QA-SECURITY-003-the-forwarded-for-hop-arithmetic-resolves-the-visitor-not-nu.md
A	docs/qa/scenarios/QA-TENANT-063-the-workspace-switcher-truncates-rather-than-scrolling-horiz.md
A	docs/qa/scenarios/QA-TENANT-064-a-seeded-provisioning-interval-is-exact-on-every-run.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-002-authorization.md
M	docs/qa/test-plans/PLAN-007-tenant-provisioning.md
M	docs/qa/test-plans/PLAN-009-attendance.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/PLAN-017-subscription-orders.md
M	docs/qa/test-plans/PLAN-020-billing.md
M	docs/qa/test-plans/PLAN-034-reports.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0061-unblock-the-production-hosts-for-the-mcp-browser.md
A	docs/sessions/SESSION-0096-full-technical-health-audit-of-dijipeople.md
M	docs/sessions/SESSION-0097-durable-object-storage-move-persistent-files-to-cloudflare-r.md
A	docs/sessions/SESSION-0098-closeout-sweep-close-every-open-session-bug-and-backlog-item.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
M	packages/config/client-ip.js
A	packages/config/client-ip.test.js
M	packages/config/index.d.ts
M	packages/config/widget-runtime-contract.test.js
M	render.yaml
M	scripts/check-env-registered.mjs
A	scripts/check-render-config.mjs
M	scripts/lib/id-allocator.mjs
M	scripts/repo-health.mjs
M	scripts/validate-framework.mjs
M	services/api/prisma/seed-config.ts
M	services/api/src/app.module.ts
M	services/api/src/common/constants/audit-actions.ts
M	services/api/src/common/constants/permissions.ts
M	services/api/src/common/constants/rbac-matrix.ts
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/common/guards/public-rate-limit.guard.spec.ts
A	services/api/src/common/interceptors/authenticated-rate-limit.interceptor.spec.ts
A	services/api/src/common/interceptors/authenticated-rate-limit.interceptor.ts
M	services/api/src/common/security/client-ip.spec.ts
M	services/api/src/common/security/client-ip.ts
M	services/api/src/common/security/proxy-trust.ts
M	services/api/src/main.ts
M	services/api/src/modules/approvals/approval-matrix-resolver.service.spec.ts
M	services/api/src/modules/approvals/approval-matrix-resolver.service.ts
M	services/api/src/modules/approvals/approval-matrix.repository.ts
M	services/api/src/modules/attendance-engine/attendance-policy-resolver.service.ts
A	services/api/src/modules/attendance/attendance-correction-apply.spec.ts
A	services/api/src/modules/attendance/attendance-correction-cancel.spec.ts
A	services/api/src/modules/attendance/attendance-correction-work-sites.spec.ts
M	services/api/src/modules/attendance/attendance.controller.ts
M	services/api/src/modules/attendance/attendance.service.ts
A	services/api/src/modules/attendance/dto/attendance-correction-cancel.dto.ts
M	services/api/src/modules/billing/billing.module.ts
A	services/api/src/modules/billing/controllers/stripe-webhook.controller.spec.ts
M	services/api/src/modules/billing/controllers/stripe-webhook.controller.ts
A	services/api/src/modules/billing/services/subscription-order-sweeper.worker.spec.ts
A	services/api/src/modules/billing/services/subscription-order-sweeper.worker.ts
M	services/api/src/modules/billing/services/webhook-event-not-ready.spec.ts
M	services/api/src/modules/billing/services/webhook.service.ts
M	services/api/src/modules/employees/employees.service.spec.ts
M	services/api/src/modules/employees/employees.service.ts
M	services/api/src/modules/legal/legal.service.spec.ts
M	services/api/src/modules/legal/legal.service.ts
M	services/api/src/modules/notifications/notification-events.catalog.ts
M	services/api/src/modules/projects/customers.controller.ts
A	services/api/src/modules/projects/customers.service.spec.ts
M	services/api/src/modules/projects/customers.service.ts
M	services/api/src/modules/projects/projects.controller.ts
M	services/api/src/modules/projects/projects.repository.ts
M	services/api/src/modules/projects/projects.service.spec.ts
M	services/api/src/modules/projects/projects.service.ts
A	services/api/src/modules/reporting/engine/query-executor.spec.ts
M	services/api/src/modules/reporting/engine/query-executor.ts
M	services/api/src/modules/reporting/execution/analytics.service.ts
A	services/api/src/modules/reporting/semantic/report-source-entitlements.spec.ts
A	services/api/src/modules/reporting/semantic/report-source-entitlements.ts
M	services/api/src/modules/roles/roles.controller.ts
A	services/api/src/modules/roles/roles.service.spec.ts
M	services/api/src/modules/roles/roles.service.ts
M	services/api/src/modules/tenant-settings/attendance-settings-mandate.spec.ts
M	services/api/src/modules/tenant-settings/tenant-settings.service.ts
A	services/api/src/modules/users/users.service.spec.ts
M	services/api/src/modules/users/users.service.ts
M	services/api/test/provisioning-queue.e2e-spec.ts
M	services/api/test/public-rate-limit.e2e-spec.ts
M	turbo.json
```

## Conflicts

Ten stream branches merged into one. Three classes of conflict, all from streams
that could not see each other.

**Generated indexes** — `docs/backlog/index.md`, `open.md`,
`product-decisions.md`, `docs/qa/regressions/index.md`. Every stream that touched
a record regenerated the indexes, so each merge conflicted on files nobody edited
by hand.

**Two records asserting opposite states.** `BUG-2007`, `ITEM-0106` and
`ITEM-0114`: the ADR stream marked them `PLAN_REQUIRED` with the decision made and
the engineering owed, while the decisions stream was implementing all three in
parallel. Both sides were internally consistent and one was out of date.

**Durable id collisions.** `REG-397` claimed twice (BUG-2007 and BUG-2618),
`REG-398` twice (BUG-3007 and BUG-3152), `ADR-0006` twice (the product decisions
and the agent-branch rule). Neither the regression register nor the ADR index has
an allocator, so parallel streams each picked "the next number".

## Conflict Resolutions

**Generated indexes: regenerated, never hand-merged.** Taking either side
wholesale and re-running the generator is the only resolution that yields an index
matching the records. Hand-merging the hunks produces an index matching neither
branch, which then passes `git` and fails `backlog:check`.

The cost of the wholesale take showed up immediately and is worth recording:
resolving `docs/qa/regressions/index.md` with `--theirs` silently dropped REG-398,
399 and 400, because those entries existed only on the other side. They were
restored from the branch that wrote them. Choosing `--ours` would have lost the
other side's entries symmetrically. **A generated index is not always fully
regenerable** — the regression register is hand-written prose that no generator
can rebuild, so for that file the take must be followed by a diff against both
parents, not a regenerate.

**The implementations won.** `BUG-2007`, `ITEM-0106` and `ITEM-0114` took the
decisions stream's side. Choosing the ADR stream's side would have left three
records claiming work was still owed while the code was already merged — the
drift the framework's validators exist to catch, arriving through the resolution
rather than despite it. ADR-0006's consequences section was then corrected in
place rather than rewritten, because the interesting fact is that an ADR can be
overtaken by the work it authorised.

**Collisions renumbered by reference count, not by recency.** The billing sweeper
entry became REG-401 and the role-grant entry REG-406, the rate limiter REG-407,
in the register *and* in every record citing them. The agent-branch ADR became
ADR-0008 because it had two referring files against the product decisions' six.
Renumbering the more-referenced record would have meant more edits and more
chances to leave a dangling citation. Bare `ADR-0006` references had already begun
resolving to two different documents, which is worse than a duplicate filename
because nothing looks wrong.

## QA

| | |
|---|---|
| **QA Report** | No separate run record. Verification was the CI gate on the exact SHA plus the full local suites; eleven new QA scenarios were written against the fixes instead (QA-REPORTS-001/002, QA-TENANT-063/064, QA-BILLING-028/029, QA-ATTENDANCE-010/011/012, QA-AUTHZ-014/015, QA-SECURITY-002/003). |
| **Bug IDs** | Closed: BUG-2007, 2462, 2494, 2495, 2504, 2508, 2573, 2618, 2888, 3007, 3020, 3021. Created and closed: BUG-3110 (open — rotation is the owner's), BUG-3115, BUG-3152, BUG-3241, BUG-3254, BUG-3263. Plus ~60 created from the audit and left TRIAGE_REQUIRED for scheduling. |
| **Backlog Items** | Closed: ITEM-0036, 0049, 0068, 0074, 0084, 0092, 0093, 0105, 0106, 0107, 0108(part), 0109, 0111, 0112, 0114, 0115, 0117, 0124, 0125, 0128, 0130. ExecPlans written for ITEM-0009, 0020, 0022, 0023. Created: ITEM-0131 (no database backup), ITEM-0156, 0157, 0158. |

## CI

| | |
|---|---|
| **CI Run ID** | `34552402808` on `658eb39c`. Three earlier runs failed and are the substance of this record: `34545828468`, `34548046363`, `34550081262`. |
| **CI Result** | PASS — all 15 checks green, read on the exact SHA that was pushed to `develop`. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The integration was a ref-push, so the merged SHA and the validated SHA are the
same object — `658eb39c` — and the `CI required gate` verdict on it is the
post-merge verdict. That is the reason for preferring a ref-push here: a merge
commit on top of a verified branch is a new, unverified commit, and `develop`
would then be running code no gate had seen.

Confirmed after the push: `origin/develop` resolves to
`658eb39c2babd40c831a029a3baa58fd58f12db3`, byte-equal to the task tip.

Locally against that same tree: API 6566 tests in 322 suites; e2e 408 in 38 (with
the job's own `verify-database`, `seed:demo` and `seed:admin` steps replicated);
web 1704 in 78; admin 399 in 44; lint 6/6 tasks with 0 errors and api warnings at
780 against a ratchet of 789; `validate:framework` 5139 checks; all five generator
`--check`s and all four record `--check`s current.

## Release / Deployment Impact

None — not deployed. `MAIN_CHANGE_STATUS = UNTOUCHED` against baseline
`6b2cd00`, and production still serves that commit.

Two things in this change set are staged rather than shipped, deliberately:

- **The PII-at-rest encryption** (OBS-24) reached its expand phase only. The
  contract migration is written and not applied, and the production backfill is a
  script the owner runs. It rewrites every stored bank account and national id,
  and this database has no backup beyond an untested six-hour window
  ([[ITEM-0131]]), so it should not run unattended.
- **The leaked production database credential** ([[BUG-3110]]) is not rotated.
  Repository secret scanning, push protection and Dependabot are now enabled, but
  the rotation itself and the Render environment update are the owner's.

## Knowledge Capture

`docs/knowledge/framework/a-review-that-never-opens-the-screen-2026-09-11.md` —
written by the items stream for ITEM-0130, on reviewing the screens adjacent to a
change rather than only the diff. It also documents a technique proven twice in
this task: `renderToStaticMarkup` renders a context-light `apps/web` component for
real inside the existing Node test environment, with no jsdom and no new
dependency.

The register entries carry the rest, because each is attached to the defect that
taught it. The three worth reading on their own:

- **REG-409** — a red test blamed on the code it exercises rather than its own
  setup, and a security boundary edited to make it pass. The boundary was correct;
  the test was a hop short.
- **REG-410** — a fixture helper that reads the clock once per timestamp is sound
  for absolute ages and unsound for differences, and a suite mixing both hides it.
- **REG-408** — two endpoints on identical permission decorators where only one
  enforced the rule. `PermissionsGuard` proves the gate matches, never that the
  service behind it does.

## Obsidian Sync

Not run. `sync-obsidian.mjs` needs a local vault configuration that this session
does not have, so publishing would either fail or write into the wrong place.

Nothing is lost by deferring it: the vault is a projection of the Git-tracked
records, and every record, index, dashboard and the Engineering Control Center is
current in the repository. A later session with the vault configured can sync and
`knowledge:verify` without re-deriving anything.

## Cleanup

Kept, deliberately, and this needs an owner rather than a tidy answer.

Eleven worktrees were created — `dijipeople-closeout` plus ten `dp-s*` streams —
and all eleven remain, with their branches. They are kept because the ten stream
branches are the provenance of this integration: the merge resolutions above cite
which side came from which branch, and deleting them turns those citations into
dead references.

They must not be removed with `git worktree remove`. Each carries `node_modules`
junctions into the primary checkout, and that command follows them — it has
previously deleted thousands of tracked files out of the user's own workspace. Use
the repository's guarded path, and verify the junctions are gone first.

Worktree and primary state at close: `PRIMARY_WORKTREE_STATUS CLEAN`,
`TASK_WORKTREE_STATUS CLEAN`, `UNEXPLAINED_DIRTY_FILES 0`. Local `develop` and
`main` were both fast-forwarded to their remotes, so the primary checkout is not
left stale.

Two throwaway databases remain on the local Postgres:
`dijipeople_closeout_e2e` and `dijipeople_closeout_e2e_test`. Neither is the
populated `dijipeople` development database, which was never written to.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0006]] · [[ADR-0007]] · [[ADR-0008]] · [[BUG-2007]] · [[BUG-2462]] · [[BUG-2494]] · [[BUG-2495]] · [[BUG-2504]] · [[BUG-2508]] · [[BUG-2509]] · [[BUG-2573]] · [[BUG-2618]] · [[BUG-2888]] · [[BUG-3007]] · [[BUG-3020]] · [[BUG-3021]] · [[BUG-3110]] · [[BUG-3115]] · [[BUG-3152]] · [[BUG-3241]] · [[BUG-3254]] · [[BUG-3263]] · [[EXECPLAN-0032]] · [[EXECPLAN-0033]] · [[ITEM-0009]] · [[ITEM-0020]] · [[ITEM-0022]] · [[ITEM-0023]] · [[ITEM-0036]] · [[ITEM-0049]] · [[ITEM-0068]] · [[ITEM-0074]] · [[ITEM-0077]] · [[ITEM-0084]] · [[ITEM-0092]] · [[ITEM-0093]] · [[ITEM-0105]] · [[ITEM-0106]] · [[ITEM-0107]] · [[ITEM-0108]] · [[ITEM-0109]] · [[ITEM-0111]] · [[ITEM-0112]] · [[ITEM-0114]] · [[ITEM-0115]] · [[ITEM-0117]] · [[ITEM-0124]] · [[ITEM-0125]] · [[ITEM-0128]] · [[ITEM-0130]] · [[ITEM-0131]] · [[ITEM-0156]] · [[ITEM-0158]] · [[PLAN-002]] · [[PLAN-007]] · [[PLAN-009]] · [[PLAN-011]] · [[PLAN-017]] · [[PLAN-020]] · [[PLAN-034]] · [[QA-ATTENDANCE-010]] · [[QA-ATTENDANCE-011]] · [[QA-ATTENDANCE-012]] · [[QA-AUTHZ-014]] · [[QA-AUTHZ-015]] · [[QA-BILLING-028]] · [[QA-BILLING-029]] · [[QA-REPORTS-001]] · [[QA-REPORTS-002]] · [[QA-RUNTIME-041]] · [[QA-SECURITY-002]] · [[QA-SECURITY-003]] · [[QA-TENANT-063]] · [[QA-TENANT-064]] · [[SESSION-0061]] · [[SESSION-0096]] · [[SESSION-0097]] · [[SESSION-0098]] · [[TASK-0005]]

<!-- GRAPH:END -->
