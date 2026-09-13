# Engineering History — Task 0031 demo walkthrough 2 remediation

| | |
|---|---|
| **Task Title** | Task 0031 demo walkthrough 2 remediation |
| **Task Type** | FEATURE — a PROGRAM of six work packages plus a production release (TASK-0031) |
| **Date** | 2026-09-13 |
| **Architect Plan** | `docs/plans/EXECPLAN-0045` … `EXECPLAN-0050`, one per implementation work package; decomposition in `docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz.md` |
| **Agents Used** | Architect, QA, Backend/API, Frontend, UI/UX, Security, Reviewer, Integrator, Release/DevOps, Product & Backlog Steward. Not used: Database (no schema change — assumption A-03 held), Knowledge & Graph beyond generated indexes |

## Git

| | |
|---|---|
| **Base Branch** | `f36ec9a9` |
| **Task Branch** | `agent/walkthrough2-integration` |
| **Base SHA** | `f36ec9a90da406c076d935a8d29888d6c7b5a566` |
| **Final Task SHA** | `e253306a7b8ffea3a2f8f833bd4f0c628154f5e3` |
| **Target Branch** | `main` |
| **Merge Commit** | `e253306a` — PR #80, `develop` → `main`, merge commit over CI-verified head `f865ac5e` |
| **Final Target SHA** | `e253306a7b8ffea3a2f8f833bd4f0c628154f5e3` on `main`; `develop` fast-forwarded to the same SHA |

### Commits

```
516b6ede docs(history): close out the subscription plans screen review
2b6b5693 docs: close SESSION-0103 and TASK-0030, and file the release as SESSION-0104
c816f523 Merge SESSION-0099's stranded closure commit
818770c0 docs(history): file SESSION-0103's engineering history, and repair the graph links it broke
88f33c6e docs(history): the primary worktree stopped being clean during closure, so say so
6a42910f docs(backlog): file the second demo walkthrough findings and the owner's decisions
c494311d docs(backlog): regenerate the indexes, inventory and dashboards for the walkthrough records
17525e8a docs(plans): EXECPLAN-0050 — production retires sink email providers, honest delivery logs
3d074612 docs(plans): EXECPLAN-0047 — employee record remediation from the second walkthrough
db85fcdf docs(plans): EXECPLAN-0045 — Customization end to end for permission holders
5494be95 docs(plans): EXECPLAN-0048 — real default email copy and a visual template editor (BUG-3500, ITEM-0181)
d6684a8c docs(plans): EXECPLAN-0046 — published custom modules render in the tenant runtime
003dfded docs(plans): EXECPLAN-0049 one notification events page (ITEM-0180, WP-05)
a1e9d719 fix(customization): authorize by permission keys on both sides; accept fields without a length
38b87103 fix(notifications): production retires Console and Dev email providers (BUG-3501)
59a5a9ee fix(data): serve only published custom modules, guard record endpoints (BUG-3494)
6e661c38 feat(notifications): one notification events page with truthful toggles (ITEM-0180, WP-05)
c213b6ae feat(web): published custom modules get a sidebar entry and runtime screens (BUG-3494)
11e987a6 fix(settings): honest Email Providers screen and one Delivery Logs screen (BUG-3501, ITEM-0182)
27bff342 Merge WP-02 - published custom modules in the tenant runtime (BUG-3494)
f09ddce2 Merge WP-06 - email providers and delivery logs (BUG-3501, ITEM-0182)
bbbd34da fix(employees): record walkthrough remediation — hierarchy, work sites, reset password, export
270757ba docs(tasks): WP-03 stream report for TASK-0031
9183d737 Merge WP-03 - employee record: hierarchy dialog, work-sites tab, reset password, export, usability (BUG-3497, BUG-3498, BUG-3499, ITEM-0179)
dba1605d fix(employees): enforce ADR-0014 on the server and retire the in-form work-site widget
37a982b7 fix(notifications): real default email copy, no placeholder path, guarded seed (BUG-3500); visual template editor (ITEM-0181)
6581cdc5 fix(notifications): audit snapshots captured before the write; keep the Notification Rules title (ITEM-0180, WP-05)
0c52ba76 fix(customization): publishable default package, validated metadata, and plain customization screens
b0d8278d docs(tasks): WP-04 stream report — BUG-3500, ITEM-0181, REG-505..REG-509 entries
1051495e docs(tasks): WP-05 stream report and EXECPLAN-0049 completion (ITEM-0180)
811a915c docs(tasks): TASK-0031 WP-01 stream report — BUG-3491/3492/3493/3495/3496, ITEM-0183/0184 customization rows
67eacacf style(config): format the widget registry test
d0922e9b Merge WP-04 - real default email copy and a visual template editor (BUG-3500, ITEM-0181)
80235361 Merge WP-05 - one plain notification events page (ITEM-0180)
ca33e9a5 Merge WP-01 - customization blockers: permission-based access, field creation, publish path, validation, hydration (BUG-3491, BUG-3492, BUG-3493, BUG-3495, BUG-3496)
4d249b40 fix(customization): list published custom modules in the Sidebar Designer
23044aed fix(notifications,data): repair the integration seams between WP-04, WP-05 and WP-06
89bc55a6 docs(context): regenerate the component index for TASK-0031's documented components
2a8f811a fix(data): let a published custom module create records without a parent
cff72bbe fix(data): give SELF-scoped custom-record readers an owner column that exists
b8c40316 docs(qa): register TASK-0031 regressions REG-481..519 and their QA scenarios
4f8df49c docs(backlog): mark BUG-3491..3501 FIXED and ITEM-0179..0184 DONE for TASK-0031
3931b0e2 docs(backlog): file TASK-0031 follow-ups BUG-3506 and ITEM-0185..0196
13d884f7 docs(tasks): advance TASK-0031 to WP-07 and regenerate indexes
58e4c32a merge: TASK-0031 records update into the walkthrough2 integration
22511c32 fix(web): a published custom module with an empty form keeps a usable create screen
a42741a0 docs(tasks): TASK-0031 work-package files, browser QA results and BUG-3523
f865ac5e test(data): keep the new create-without-parent case under the API lint ratchet
e253306a Release: TASK-0031 demo walkthrough 2 remediation (#80)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            b7bd1ca7 [develop]
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
D:/My Work/hrm-dijipeople/dijipeople-walkthrough2               c494311d [agent/demo-walkthrough-2-records]
D:/My Work/hrm-dijipeople/dijipeople-wt2-custom-runtime         c213b6ae [agent/walkthrough2-custom-runtime]
D:/My Work/hrm-dijipeople/dijipeople-wt2-customization          811a915c [agent/walkthrough2-customization]
D:/My Work/hrm-dijipeople/dijipeople-wt2-email-templates        b0d8278d [agent/walkthrough2-email-templates]
D:/My Work/hrm-dijipeople/dijipeople-wt2-employee-record        270757ba [agent/walkthrough2-employee-record]
D:/My Work/hrm-dijipeople/dijipeople-wt2-integration            e253306a [agent/walkthrough2-integration]
D:/My Work/hrm-dijipeople/dijipeople-wt2-notification-events    1051495e [agent/walkthrough2-notification-events]
D:/My Work/hrm-dijipeople/dijipeople-wt2-providers-logs         11e987a6 [agent/walkthrough2-providers-logs]
D:/My Work/hrm-dijipeople/dijipeople-wt2-records2               13d884f7 [agent/walkthrough2-records-update]
D:/My Work/hrm-dijipeople/dijipeople-wt2-verify                 f865ac5e [agent/walkthrough2-verify]
D:/My Work/hrm-dijipeople/dp-plans-review                       516b6ede [agent/review-subscription-plans-screen]
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

315 file(s) against `f36ec9a9`.

```
M	.agent/context/component-index.md
M	apps/web/app/(authenticated)/_components/dashboard-sidebar.tsx
M	apps/web/app/(authenticated)/_components/navigation.ts
M	apps/web/app/(authenticated)/_components/record-page-shell.conformance.spec.ts
A	apps/web/app/(authenticated)/custom-modules/[moduleKey]/[recordId]/edit/page.tsx
A	apps/web/app/(authenticated)/custom-modules/[moduleKey]/[recordId]/page.tsx
A	apps/web/app/(authenticated)/custom-modules/[moduleKey]/new/page.tsx
A	apps/web/app/(authenticated)/custom-modules/[moduleKey]/page.tsx
A	apps/web/app/(authenticated)/custom-modules/_components/custom-module-unavailable.tsx
M	apps/web/app/(authenticated)/employees/_components/employee-runtime-form-wrapper.tsx
M	apps/web/app/(authenticated)/layout.tsx
A	apps/web/app/(authenticated)/settings/_components/delivery-log-channel-switch.tsx
M	apps/web/app/(authenticated)/settings/_components/settings-runtime-pages.tsx
A	apps/web/app/(authenticated)/settings/_lib/delivery-log-channel.spec.ts
A	apps/web/app/(authenticated)/settings/_lib/delivery-log-channel.ts
M	apps/web/app/(authenticated)/settings/_lib/require-settings-permission.spec.ts
M	apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts
M	apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts
M	apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts
M	apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts
M	apps/web/app/(authenticated)/settings/customization/_components/columns-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/custom-package-picker-dialog.tsx
A	apps/web/app/(authenticated)/settings/customization/_components/customization-access-denied.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/form-designer-workspace.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/forms-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/metadata-components-management.tsx
A	apps/web/app/(authenticated)/settings/customization/_components/module-tab-page.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/package-detail-shell.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/packages-list.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/publish-center.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/sidebar-designer.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/table-detail-shell.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/tables-list.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/view-designer-workspace.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/views-management.tsx
A	apps/web/app/(authenticated)/settings/customization/_lib/column-payload.spec.ts
A	apps/web/app/(authenticated)/settings/customization/_lib/column-payload.ts
A	apps/web/app/(authenticated)/settings/customization/_lib/customization-access.ts
A	apps/web/app/(authenticated)/settings/customization/_lib/customization-keys.ts
A	apps/web/app/(authenticated)/settings/customization/_lib/customization-page-permissions.json
M	apps/web/app/(authenticated)/settings/customization/layout.tsx
M	apps/web/app/(authenticated)/settings/customization/packages/[packageId]/page.tsx
M	apps/web/app/(authenticated)/settings/customization/packages/page.tsx
M	apps/web/app/(authenticated)/settings/customization/page.tsx
M	apps/web/app/(authenticated)/settings/customization/publish/page.tsx
M	apps/web/app/(authenticated)/settings/customization/sidebar/page.tsx
M	apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/columns/page.tsx
M	apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/forms/[formId]/designer/page.tsx
M	apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/forms/page.tsx
M	apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/page.tsx
M	apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/views/[viewId]/designer/page.tsx
M	apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/views/page.tsx
M	apps/web/app/(authenticated)/settings/customization/tables/page.tsx
M	apps/web/app/(authenticated)/settings/customization/types.ts
A	apps/web/app/(authenticated)/settings/notifications/_components/email-delivery-path.spec.ts
A	apps/web/app/(authenticated)/settings/notifications/_components/email-delivery-path.ts
M	apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx
A	apps/web/app/(authenticated)/settings/notifications/_components/email-template-composer.tsx
M	apps/web/app/(authenticated)/settings/notifications/_components/email-template-create-form.tsx
M	apps/web/app/(authenticated)/settings/notifications/_components/email-template-editor.tsx
A	apps/web/app/(authenticated)/settings/notifications/_components/email-template-preview.tsx
A	apps/web/app/(authenticated)/settings/notifications/_components/email-template-rich-text-editor.tsx
A	apps/web/app/(authenticated)/settings/notifications/_components/email-template-variable-menu.tsx
M	apps/web/app/(authenticated)/settings/notifications/_components/email-templates-table.tsx
A	apps/web/app/(authenticated)/settings/notifications/_components/notification-events-manager.tsx
A	apps/web/app/(authenticated)/settings/notifications/_components/notification-events-model.spec.ts
A	apps/web/app/(authenticated)/settings/notifications/_components/notification-events-model.ts
D	apps/web/app/(authenticated)/settings/notifications/_components/notification-rules-manager.tsx
M	apps/web/app/(authenticated)/settings/notifications/providers/page.tsx
M	apps/web/app/(authenticated)/settings/notifications/rules/page.tsx
M	apps/web/app/(authenticated)/settings/notifications/templates/[id]/page.tsx
A	apps/web/app/(authenticated)/settings/notifications/templates/_lib/email-template-client.ts
A	apps/web/app/(authenticated)/settings/notifications/templates/_lib/email-template-editing.spec.ts
A	apps/web/app/(authenticated)/settings/notifications/templates/_lib/email-template-editing.ts
A	apps/web/app/(authenticated)/settings/notifications/templates/_lib/email-template-payload.fixture.json
M	apps/web/app/(authenticated)/settings/notifications/templates/new/page.tsx
M	apps/web/app/(authenticated)/settings/notifications/templates/page.tsx
M	apps/web/app/(public)/login/login-form.tsx
M	apps/web/app/api/data/[entityLogicalName]/[recordId]/route.ts
M	apps/web/app/components/errors/error-provider.tsx
A	apps/web/app/components/errors/runtime-error-classification.spec.ts
A	apps/web/app/components/errors/runtime-error-classification.ts
M	apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx
M	apps/web/app/components/runtime/module-assign-dialog.tsx
M	apps/web/app/components/runtime/module-record-page.tsx
M	apps/web/app/components/runtime/module-record-status-popover.tsx
M	apps/web/app/components/runtime/module-related-subgrid.tsx
M	apps/web/app/components/runtime/module-runtime-command-handler.tsx
M	apps/web/app/components/runtime/module-widget-renderer.tsx
M	apps/web/app/components/runtime/responsive-runtime-tabs.tsx
M	apps/web/app/components/runtime/standard-module-list-page.tsx
M	apps/web/app/components/ui/form-control.tsx
A	apps/web/app/components/ui/listbox-escape.spec.ts
M	apps/web/lib/auth-config.ts
M	apps/web/lib/notifications-api.ts
M	apps/web/lib/runtime/command-failure-message.ts
A	apps/web/lib/runtime/custom-modules/custom-module-api.ts
A	apps/web/lib/runtime/custom-modules/custom-module-navigation.spec.ts
A	apps/web/lib/runtime/custom-modules/custom-module-navigation.ts
A	apps/web/lib/runtime/custom-modules/custom-module-runtime.spec.ts
A	apps/web/lib/runtime/custom-modules/custom-module-runtime.ts
M	apps/web/lib/runtime/form-layout-grid.ts
A	apps/web/lib/runtime/form-layout-section-columns.spec.ts
M	apps/web/lib/runtime/metadata-runtime.types.ts
A	apps/web/lib/runtime/module-adapter-command-handlers.export.spec.ts
M	apps/web/lib/runtime/module-adapter-command-handlers.ts
M	apps/web/lib/runtime/module-data-adapter.types.ts
A	apps/web/lib/runtime/modules/employee-account-actions.spec.ts
A	apps/web/lib/runtime/modules/employee-account-actions.ts
M	apps/web/lib/runtime/modules/employee-data.adapter.ts
A	apps/web/lib/runtime/modules/employee-hierarchy-tree.spec.ts
A	apps/web/lib/runtime/modules/employee-hierarchy-tree.ts
M	apps/web/lib/runtime/modules/employee-metadata.adapter.ts
A	apps/web/lib/runtime/modules/employee-metadata.work-sites.spec.ts
A	apps/web/lib/runtime/modules/employee-record-removed-copy.spec.ts
A	apps/web/lib/runtime/modules/employee-work-sites.spec.ts
A	apps/web/lib/runtime/modules/employee-work-sites.ts
M	apps/web/lib/runtime/modules/standard-module-route-helpers.ts
A	apps/web/lib/runtime/related-subgrid-rows.spec.ts
A	apps/web/lib/runtime/related-subgrid-rows.ts
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0163-give-every-lookup-one-behaviour-an-openable-label-one-implem.md
M	docs/backlog/items/ITEM-0164-an-organization-hierarchy-viewer-reachable-from-the-employee.md
M	docs/backlog/items/ITEM-0165-present-an-employee-s-primary-location-and-authorised-work-s.md
M	docs/backlog/items/ITEM-0172-wire-debounced-search-and-the-openable-label-into-the-metada.md
A	docs/backlog/items/ITEM-0179-manage-employee-work-sites-in-a-related-records-tab-with-a-t.md
A	docs/backlog/items/ITEM-0180-one-plain-notification-events-page-replacing-rules-and-chann.md
A	docs/backlog/items/ITEM-0181-a-visual-email-template-editor-with-a-variable-picker-and-re.md
A	docs/backlog/items/ITEM-0182-delivery-logs-that-cover-in-app-notifications-and-state-why-.md
A	docs/backlog/items/ITEM-0183-remove-agent-added-explanatory-helper-text-from-tenant-scree.md
A	docs/backlog/items/ITEM-0184-employee-record-and-customization-usability-defects-found-in.md
A	docs/backlog/items/ITEM-0185-the-settings-shell-keeps-a-fixed-width-navigation-column-bes.md
A	docs/backlog/items/ITEM-0186-the-form-designer-palette-adds-a-field-on-click-only-and-dra.md
A	docs/backlog/items/ITEM-0187-custom-module-list-views-filter-only-the-loaded-page-and-the.md
A	docs/backlog/items/ITEM-0188-custom-module-screens-ignore-the-module-s-published-action-b.md
A	docs/backlog/items/ITEM-0189-custom-module-lookup-fields-that-target-system-entities-have.md
A	docs/backlog/items/ITEM-0190-the-custom-module-sidebar-entry-ignores-the-module-s-configu.md
A	docs/backlog/items/ITEM-0191-decide-whether-custom-modules-need-their-own-access-keys-ins.md
A	docs/backlog/items/ITEM-0192-the-unreachable-notifications-settings-form-still-declares-i.md
A	docs/backlog/items/ITEM-0193-decide-whether-the-hr-role-may-manage-notification-events.md
A	docs/backlog/items/ITEM-0194-check-production-for-tenant-owned-copies-of-the-old-placehol.md
A	docs/backlog/items/ITEM-0195-the-legacy-publish-snapshot-shape-can-expose-a-never-publish.md
A	docs/backlog/items/ITEM-0196-the-employee-record-still-shows-a-hardcoded-cnic-field-an-en.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-3331-subscribe-is-enabled-for-a-tenant-that-already-has-an-active.md
M	docs/bugs/BUG-3350-the-plan-comparison-sells-module-exclusivity-the-platform-is.md
M	docs/bugs/BUG-3355-a-second-sign-in-silently-destroys-the-first-session-and-the.md
M	docs/bugs/BUG-3374-settings-customization-and-its-twelve-child-routes-silently-.md
M	docs/bugs/BUG-3375-the-notification-rules-screen-edits-preferences-and-cannot-r.md
M	docs/bugs/BUG-3379-a-delivery-log-row-says-not-delivered-and-carries-nothing-th.md
M	docs/bugs/BUG-3450-get-employees-id-reporting-structure-computed-every-root-in-.md
A	docs/bugs/BUG-3491-customization-pages-crash-for-a-user-who-holds-customization.md
A	docs/bugs/BUG-3492-every-custom-field-type-without-a-length-is-rejected-with-ma.md
A	docs/bugs/BUG-3493-publishing-customizations-dead-ends-because-new-drafts-land-.md
A	docs/bugs/BUG-3494-a-published-custom-module-has-no-sidebar-entry-and-no-list-f.md
A	docs/bugs/BUG-3495-customization-editors-accept-invalid-metadata-and-silently-r.md
A	docs/bugs/BUG-3496-a-hydration-mismatch-on-customization-pages-opens-a-blocking.md
A	docs/bugs/BUG-3497-employee-reset-password-sends-without-confirmation-is-offere.md
A	docs/bugs/BUG-3498-the-employee-record-export-writes-lookup-fields-as-raw-ids.md
A	docs/bugs/BUG-3499-the-reporting-hierarchy-dialog-pins-a-clipped-detail-card-ha.md
A	docs/bugs/BUG-3500-every-seeded-email-template-is-active-with-placeholder-body-.md
A	docs/bugs/BUG-3501-the-email-provider-screen-presents-a-console-sink-as-deliver.md
A	docs/bugs/BUG-3506-the-payslip-email-has-no-working-button-and-names-the-payrol.md
A	docs/bugs/BUG-3523-custom-module-page-header-shows-the-table-key-instead-of-the.md
A	docs/decisions/ADR-0013-customization-access-is-granted-by-permission.md
A	docs/decisions/ADR-0014-employee-work-sites-are-a-related-records-tab.md
A	docs/decisions/ADR-0015-production-retires-sink-email-providers.md
A	docs/decisions/ADR-0016-published-custom-modules-render-in-the-tenant-runtime.md
A	docs/decisions/ADR-0017-the-hierarchy-viewer-stays-a-chain-scoped-dialog.md
M	docs/decisions/README.md
A	docs/engineering-history/tasks/2026-09-11-review-subscription-plans-screen-118d22ed.md
A	docs/engineering-history/tasks/2026-09-12-records-0099-0102-413565f0.md
M	docs/environment-variables.md
M	docs/knowledge/architecture/screen-map.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/framework/parallel-streams-collide-on-every-unallocated-id-2026-09-12.md
M	docs/knowledge/modules/billing.md
M	docs/plans/EXECPLAN-0037-tenant-plan-change-endpoint.md
M	docs/plans/EXECPLAN-0038-notification-coverage-for-silent-tenant-modules.md
M	docs/plans/EXECPLAN-0039-manual-email-delivery-retry.md
M	docs/plans/EXECPLAN-0040-lookup-search-and-openable-label-consistency.md
M	docs/plans/EXECPLAN-0042-notification-rule-administration-and-unified-dispatch-gate.md
M	docs/plans/EXECPLAN-0043-employee-reporting-hierarchy-tree-viewer.md
M	docs/plans/EXECPLAN-0044-record-page-shell-adoption.md
A	docs/plans/EXECPLAN-0045-customization-end-to-end-for-permission-holders.md
A	docs/plans/EXECPLAN-0046-published-custom-modules-tenant-runtime.md
A	docs/plans/EXECPLAN-0047-employee-record-walkthrough-two-remediation.md
A	docs/plans/EXECPLAN-0048-email-template-default-copy-and-visual-editor.md
A	docs/plans/EXECPLAN-0049-one-notification-events-page.md
A	docs/plans/EXECPLAN-0050-production-retires-sink-email-providers-and-honest-delivery-logs.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
M	docs/qa/scenarios/QA-AUTH-011-concurrent-sessions-are-allowed-by-default-unless-a-tenant-o.md
A	docs/qa/scenarios/QA-EMPLOYEE-002-employee-reset-password-confirms-is-hidden-without-a-linked-.md
A	docs/qa/scenarios/QA-EMPLOYEE-003-the-employee-record-export-writes-lookup-display-names-never.md
A	docs/qa/scenarios/QA-EMPLOYEE-004-the-reporting-hierarchy-dialog-shows-unclipped-cards-on-hove.md
A	docs/qa/scenarios/QA-EMPLOYEE-005-employee-work-sites-are-managed-in-the-work-sites-tab-and-ma.md
A	docs/qa/scenarios/QA-EMPLOYEE-006-the-primary-work-site-changes-only-through-the-transactional.md
A	docs/qa/scenarios/QA-EMPLOYEE-007-existing-employee-records-hide-create-time-fields-and-lay-se.md
A	docs/qa/scenarios/QA-RUNTIME-045-a-published-custom-module-has-a-sidebar-entry-and-list-form-.md
A	docs/qa/scenarios/QA-RUNTIME-046-custom-module-records-are-unreachable-before-publish-from-an.md
A	docs/qa/scenarios/QA-SETTINGS-021-a-user-holding-the-customization-permissions-without-a-custo.md
A	docs/qa/scenarios/QA-SETTINGS-022-every-custom-field-type-saves-from-the-add-field-dialog.md
A	docs/qa/scenarios/QA-SETTINGS-023-customization-drafts-created-without-a-package-publish-from-.md
A	docs/qa/scenarios/QA-SETTINGS-024-customization-editors-refuse-unusable-metadata-and-escape-cl.md
A	docs/qa/scenarios/QA-SETTINGS-025-customization-pages-load-without-a-hydration-error-modal-or-.md
A	docs/qa/scenarios/QA-SETTINGS-026-removed-explanatory-helper-text-stays-removed-from-tenant-sc.md
A	docs/qa/scenarios/QA-SETTINGS-027-system-email-templates-ship-authored-copy-and-seeds-never-ov.md
A	docs/qa/scenarios/QA-SETTINGS-028-email-templates-are-authored-with-a-visual-editor-a-variable.md
A	docs/qa/scenarios/QA-SETTINGS-029-the-notification-events-page-toggles-in-app-and-email-per-ev.md
A	docs/qa/scenarios/QA-SETTINGS-030-production-refuses-and-ignores-console-and-dev-email-provide.md
A	docs/qa/scenarios/QA-SETTINGS-031-the-email-providers-screen-states-the-real-delivery-path.md
A	docs/qa/scenarios/QA-SETTINGS-032-delivery-logs-show-a-reason-column-an-in-app-channel-and-one.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/PLAN-021-settings.md
M	docs/qa/test-plans/PLAN-038-notifications.md
M	docs/qa/test-plans/PLAN-040-employees.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0099-review-tenant-subscription-plans-features-screen.md
M	docs/sessions/SESSION-0103-implement-the-34-open-records-from-sessions-0099-0102.md
A	docs/sessions/SESSION-0104-release-promote-the-session-0103-records-to-production.md
A	docs/sessions/SESSION-0105-demo-walkthrough-2-hierarchy-work-site-customization-notific.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/TASK-0030-implement-the-34-open-records-from-sessions-0099-0102.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-00-findings-records-and-owner-decisions.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-01-customization-blockers.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-02-published-custom-modules-in-the-runtime.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-03-employee-record.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-04-email-templates.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-05-one-plain-notification-events-page.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-06-email-providers-and-delivery-logs.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-07-integration-browser-qa-ci-develop.md
A	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz/work-packages/WP-08-production-release-and-demo-verification.md
A	docs/tasks/TASK-0031-streams/WP-01-report.md
A	docs/tasks/TASK-0031-streams/WP-02-report.md
A	docs/tasks/TASK-0031-streams/WP-03-report.md
A	docs/tasks/TASK-0031-streams/WP-04-email-copy-for-owner-review.md
A	docs/tasks/TASK-0031-streams/WP-04-report.md
A	docs/tasks/TASK-0031-streams/WP-05-report.md
A	docs/tasks/TASK-0031-streams/WP-06-report.md
M	docs/tasks/active.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	packages/config/email-providers.js
A	packages/config/email-providers.test.js
M	packages/config/index.d.ts
M	packages/config/index.js
M	packages/config/system-widget-registry.js
M	packages/config/system-widget-registry.test.js
M	services/api/prisma/seed-config.ts
M	services/api/src/modules/attendance-integrations/operations/attendance-operations.controller.ts
A	services/api/src/modules/attendance-integrations/operations/attendance-operations.dto.spec.ts
A	services/api/src/modules/attendance-integrations/operations/attendance-operations.service.spec.ts
M	services/api/src/modules/attendance-integrations/operations/attendance-operations.service.ts
A	services/api/src/modules/customization/column-payload.seam.spec.ts
M	services/api/src/modules/customization/customization-access.guard.spec.ts
M	services/api/src/modules/customization/customization-access.guard.ts
A	services/api/src/modules/customization/customization-publish-and-metadata.spec.ts
A	services/api/src/modules/customization/customization-web-gate.seam.spec.ts
M	services/api/src/modules/customization/customization.controller.ts
M	services/api/src/modules/customization/customization.service.ts
M	services/api/src/modules/customization/dto/customization.dto.ts
M	services/api/src/modules/data/custom-data.service.spec.ts
M	services/api/src/modules/data/custom-data.service.ts
A	services/api/src/modules/data/custom-module-runtime.controller.ts
A	services/api/src/modules/data/custom-module-runtime.service.spec.ts
A	services/api/src/modules/data/custom-module-runtime.service.ts
A	services/api/src/modules/data/custom-records.metadata.ts
A	services/api/src/modules/data/data.controller.permissions.spec.ts
M	services/api/src/modules/data/data.controller.ts
M	services/api/src/modules/data/data.module.ts
A	services/api/src/modules/data/published-custom-modules.spec.ts
A	services/api/src/modules/data/published-custom-modules.ts
M	services/api/src/modules/employees/employees.service.spec.ts
M	services/api/src/modules/employees/employees.service.ts
M	services/api/src/modules/notifications/dto/email-execution.dto.ts
A	services/api/src/modules/notifications/dto/email-template-payload.spec.ts
M	services/api/src/modules/notifications/dto/email-template.dto.ts
A	services/api/src/modules/notifications/dto/in-app-delivery-log-query.dto.ts
M	services/api/src/modules/notifications/dto/index.ts
A	services/api/src/modules/notifications/dto/notification-event-channel.dto.ts
M	services/api/src/modules/notifications/email/effective-email-provider.service.ts
M	services/api/src/modules/notifications/email/email-delivery-capability.spec.ts
M	services/api/src/modules/notifications/email/email-execution.service.ts
M	services/api/src/modules/notifications/email/email-provider-factory.service.ts
M	services/api/src/modules/notifications/email/email-safety.ts
A	services/api/src/modules/notifications/email/email-template-authoring.service.spec.ts
A	services/api/src/modules/notifications/email/email-template-authoring.service.ts
A	services/api/src/modules/notifications/email/production-sink-retirement.spec.ts
A	services/api/src/modules/notifications/in-app-delivery-logs.spec.ts
A	services/api/src/modules/notifications/notification-event-channel-dto-contract.spec.ts
A	services/api/src/modules/notifications/notification-event-delivery.spec.ts
A	services/api/src/modules/notifications/notification-event-delivery.ts
A	services/api/src/modules/notifications/notification-event-settings.spec.ts
M	services/api/src/modules/notifications/notification-events.catalog.ts
A	services/api/src/modules/notifications/notification-in-app-gate.spec.ts
M	services/api/src/modules/notifications/notification-orchestrator.service.ts
M	services/api/src/modules/notifications/notifications.controller.ts
M	services/api/src/modules/notifications/notifications.module.ts
M	services/api/src/modules/notifications/notifications.repository.ts
M	services/api/src/modules/notifications/notifications.service.ts
A	services/api/src/modules/notifications/system-email-template-emitters.spec.ts
A	services/api/src/modules/notifications/system-email-templates.copy.ts
A	services/api/src/modules/notifications/system-email-templates.spec.ts
A	services/api/test/custom-module-runtime.e2e-spec.ts
```

## Conflicts

Three, classified against the taxonomy in
[`.agent/agents/integrator.md`](../../../.agent/agents/integrator.md).

1. **`services/api/src/modules/notifications/notifications.controller.ts` and
   `notifications.service.ts`** — merging WP-06 (providers and delivery logs)
   after WP-04 (email templates) and WP-05 (events page). TYPE 2, ADDITIVE
   SEMANTIC. WP-04 moved template CRUD out of the service into
   `EmailTemplateAuthoringService` and removed `SCOPE_LABELS`,
   `mapEmailTemplate` and the template DTO imports; WP-05 and WP-06 added
   `UpdateNotificationEventChannelDto`, `InAppDeliveryLogQueryDto` and
   `providerAuditSnapshot` to the same import blocks and class.
2. **`.agent/context/component-index.md`** — merging the records branch
   (`13d884f7`) into integration. TYPE 7, GENERATED FILE. Both sides had
   regenerated the index from different trees.
3. **Session indexes under `docs/sessions/`** — rebasing the WP-00 records
   branch onto a `develop` that another session had moved. TYPE 7, GENERATED FILE.

## Conflict Resolutions

1. Resolved by usage, not by side: every symbol still referenced after the
   merge was kept and every symbol with no remaining caller was dropped. The
   controller keeps only the `EmailTemplateAuthoringService` import; the service
   keeps the WP-05/WP-06 DTOs and `providerAuditSnapshot` and loses WP-04's
   moved template helpers. The merge left `buildTenantNotificationScopeKey`
   unimported; `23044aed` restored it once the combined test run failed.
   Choosing WP-04's side would have lost the events-page channel endpoint and
   the in-app delivery log query; choosing WP-06's side would have left a
   second, dead copy of template CRUD in the service beside the new authoring
   service.
2. Regenerated with `scripts/generate-component-index.mjs` on the merged tree,
   then every generator re-run and checked. Taking either side verbatim would
   have produced an index matching neither tree — the components documented by
   TASK-0031's streams, or the records branch's state.
3. Took the branch's own record files and regenerated the indexes with
   `scripts/rebuild-sessions.mjs`. Hand-merging the hunks would have produced an
   index listing neither session set correctly.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md` — local browser QA on a throwaway database; production verification recorded under WP-08 |
| **Bug IDs** | Fixed: BUG-3491, BUG-3492, BUG-3493, BUG-3494, BUG-3495, BUG-3496, BUG-3497, BUG-3498, BUG-3499, BUG-3500, BUG-3501. Filed: BUG-3506, BUG-3523 (deferred) |
| **Backlog Items** | Done: ITEM-0179, ITEM-0180, ITEM-0181, ITEM-0182, ITEM-0183, ITEM-0184, ITEM-0194. Filed: ITEM-0185 … ITEM-0193, ITEM-0195, ITEM-0196 |

## CI

| | |
|---|---|
| **CI Run ID** | 34732185363 (push of `f865ac5e`), 34732682935 and 34732697734 (the `develop` push and PR #80 on the same SHA) |
| **CI Result** | PASS — all three runs green on `f865ac5e`, the head merged by PR #80. Earlier failures on the same branch: 34729157744 (`23044aed` — stale component index, custom-module e2e) and 34731422731 (`a42741a0` — API lint ratchet 789/787), each fixed before the merged SHA |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The merge commit `e253306a` has the same tree as the CI-verified head `f865ac5e`
(PR #80 merged `develop` into a `main` that `develop` already contained), so the
three green CI runs on `f865ac5e` are evidence for the merged tree. Against the
running production deployment of `e253306a`, on the demo tenant as its owner:

| Check | Result |
|---|---|
| `GET https://api.dijipeople.com/api/health` | `commit: e253306a…`, `status: ok` |
| `/settings/customization` | loads; every `/api` call 200; main menu lists the published custom module "QA Assets" |
| `/custom-modules/qaAsset/new` | create screen shows the module's Serial Number field with Save and Save & Close (`22511c32` live) |
| `/settings/notifications/providers` | "Email is delivered by the DijiPeople platform relay — Sent as DijiPeople <notifications@dijipeople.com>"; the Console provider reads "Not used" (ADR-0015 live) |
| `/settings/notifications/rules` | 27 channel switches across Leave, Attendance, Payroll |
| `/settings/notifications/templates` | account activation, password reset and scheduled report as ACTIVE system defaults, updated by the pre-deploy `seed:config`; no placeholder copy |
| `/settings/notifications/delivery/delivery-logs` | renders; all 13 rows predate the release (Console) |
| Owner's temporary System Customizer role | removed (`DELETE /api/users/…/roles/…` 200); roles now System Administrator only |
| `/settings/customization/modules` without that role | lists the QA Asset module; no denial, error or dialog (ADR-0013 live) |

Not verified: a real email arriving. No mail was sent by hand; the first message
through the relay is the tenant's daily scheduled report at 09:00 UTC, and its
delivery-log row is the evidence to read.

## Release / Deployment Impact

Deployed to production by PR #80. Render service `srv-d7js7fqqqhas739v4i7g`
deploy `dep-daj0mc7qj5pc73ardk10` went live on `e253306a` after its pre-deploy
step (`prisma migrate deploy` and `seed:config`) passed; Vercel `diji-people-web`
production deployment reached READY on the same commit. No schema migration in
this release. `seed:config` rewrote the system email template rows (idempotent;
a second local run changed none).

Rollback class: revert PR #80 and redeploy. The seeded template copy stays on
rollback but is only read by the new code paths.

Behaviour changes released: the three production tenants, all sink-only before
this release, now send real email through the platform relay; a previously
unticked in-app preference now suppresses that notification; turning off an
event's last channel stops its workflow email.

## Knowledge Capture

- `docs/qa/known-bug-patterns/container-saved-before-its-contents.md` — new bug
  pattern (UX / Correctness): a custom table's default form is saved before its
  columns exist and the runtime honoured the empty form; indexed in the
  pattern README.
- `docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md`
  — the local browser QA run, with regression-test proof for the empty-form fix.
- ADR-0013 … ADR-0017 and EXECPLAN-0045 … EXECPLAN-0050 were written earlier in
  the program and carry its decisions.
- Operating lessons kept outside the repository for the agent: `await-ci.mjs`
  has no `--help` and starts waiting when given one; the API lint ratchet must be
  run over the whole of `services/api`, not only the changed files, before a push.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran three times from the committed tree, against
the vault configured in the primary checkout (`DijiPeople-Vault`), each followed
by `npm run knowledge:verify`:

| Pass | Tree | Written | Verify |
|---|---|---|---|
| 1 | `255dc400` | 83 created, 45 updated (1469 current) | 40 problems — 6 introduced by this task: five stream reports under `Generated/Tasks/TASK-0031-streams/` with no wikilink, and the owner email copy review sharing the `WP-04` source id with `WP-04-report.md` |
| 2 | `adbefc73` | 1 created, 9 updated | 37 — the stale vault copy of the renamed note, and WP-05/WP-06 reports now unreachable |
| 3 | `819208d9` | 2 updated | 34 — none attributable to this task |

Fixes: each stream report links TASK-0031; the review note was renamed to
`email-copy-for-owner-review.md` with every reference updated; this task's own
stale vault copy (`source_path` the old name, `source_commit 37a982b7`) was
deleted from the vault. `OBSIDIAN_SYNC_STATUS` stays FAILED on the 34 problems
that predate this task — the same count TASK-0030 closed with — which this
task did not touch.

Notes written on the first pass, by source folder: `docs/qa/scenarios` 26,
`docs/backlog/items` 23, `docs/bugs` 16, the TASK-0031 work packages 9, the
TASK-0031 stream reports 7, `docs/sessions` 7, `docs/plans` 6,
`docs/decisions` 6, `docs/tasks` 6, `docs/backlog` 5, `docs/qa/test-plans` 5,
`docs/knowledge/dashboards` 3, `docs/engineering-history/tasks` 3,
`docs/qa/known-bug-patterns` 2, and one each from `docs/questions`,
`docs/qa/runs`, `docs/qa/regressions` and six `docs/knowledge/` folders. In the
vault's `00 - Home/Generated/` tree that is `Tasks`, `Backlog` and `Sessions`;
the other sources publish into their own mapped folders.

## Cleanup

- Local QA stack stopped (web :3101, API :4101); throwaway database
  `dijipeople_walkthrough2_test` dropped. The populated `dijipeople` database
  was never touched.
- Removed with `scripts/remove-worktree.mjs`, each branch merged into `develop`
  and each worktree clean first, local branch deleted, primary checkout verified
  intact after every removal: `dijipeople-walkthrough2`,
  `dijipeople-wt2-custom-runtime`, `dijipeople-wt2-customization`,
  `dijipeople-wt2-email-templates`, `dijipeople-wt2-employee-record`,
  `dijipeople-wt2-notification-events`, `dijipeople-wt2-providers-logs`,
  `dijipeople-wt2-records2`, `dijipeople-wt2-verify`.
- `dijipeople-wt2-integration` is kept until this record is pushed, because
  this record is committed from it.
- 88 Playwright MCP snapshot and screenshot files from this session removed
  from the primary checkout's ignored `.playwright-mcp/` folder.
- The owner's temporary System Customizer role on the demo tenant removed. The
  QA test data (the QA Asset module and its record, the QA Local Asset module on
  the local database) is kept on the demo tenant by owner decision; the local
  copy went with the database.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0013]] · [[ADR-0014]] · [[ADR-0015]] · [[ADR-0016]] · [[ADR-0017]] · [[BUG-3331]] · [[BUG-3350]] · [[BUG-3355]] · [[BUG-3374]] · [[BUG-3375]] · [[BUG-3379]] · [[BUG-3450]] · [[BUG-3491]] · [[BUG-3492]] · [[BUG-3493]] · [[BUG-3494]] · [[BUG-3495]] · [[BUG-3496]] · [[BUG-3497]] · [[BUG-3498]] · [[BUG-3499]] · [[BUG-3500]] · [[BUG-3501]] · [[BUG-3506]] · [[BUG-3523]] · [[ITEM-0163]] · [[ITEM-0164]] · [[ITEM-0165]] · [[ITEM-0172]] · [[ITEM-0179]] · [[ITEM-0180]] · [[ITEM-0181]] · [[ITEM-0182]] · [[ITEM-0183]] · [[ITEM-0184]] · [[ITEM-0185]] · [[ITEM-0186]] · [[ITEM-0187]] · [[ITEM-0188]] · [[ITEM-0189]] · [[ITEM-0190]] · [[ITEM-0191]] · [[ITEM-0192]] · [[ITEM-0193]] · [[ITEM-0194]] · [[ITEM-0195]] · [[ITEM-0196]] · [[PLAN-011]] · [[PLAN-021]] · [[PLAN-038]] · [[PLAN-040]] · [[QA-AUTH-011]] · [[QA-EMPLOYEE-002]] · [[QA-EMPLOYEE-003]] · [[QA-EMPLOYEE-004]] · [[QA-EMPLOYEE-005]] · [[QA-EMPLOYEE-006]] · [[QA-EMPLOYEE-007]] · [[QA-RUNTIME-045]] · [[QA-RUNTIME-046]] · [[QA-SETTINGS-021]] · [[QA-SETTINGS-022]] · [[QA-SETTINGS-023]] · [[QA-SETTINGS-024]] · [[QA-SETTINGS-025]] · [[QA-SETTINGS-026]] · [[QA-SETTINGS-027]] · [[QA-SETTINGS-028]] · [[QA-SETTINGS-029]] · [[QA-SETTINGS-030]] · [[QA-SETTINGS-031]] · [[QA-SETTINGS-032]] · [[SESSION-0099]] · [[SESSION-0103]] · [[SESSION-0104]] · [[SESSION-0105]] · [[TASK-0005]] · [[TASK-0030]] · [[TASK-0031]]

<!-- GRAPH:END -->
