# Engineering History — Backlog burn-down: seven open bugs and six ready items

| | |
|---|---|
| **Task Title** | Backlog burn-down: seven open bugs and six ready items |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-22 |
| **Architect Plan** | NOT_APPLICABLE — no schema change, no migration, no destructive operation. Two records asked for an ExecPlan and both questions were decisions rather than plans: BUG-0043's was "headless library or one primitive" (build one; the reasoning is recorded in `dialog.tsx`), and BUG-0045's was "which user-management surface is canonical" (the runtime route, recorded in the document itself). BUG-0041's remainder was already scoped by ITEM-0050. |
| **Agents Used** | Architect, Backend/API, Frontend, UI/UX, Security, Integration, QA, Reviewer, Integrator, Knowledge. **Not used:** Database — `SCHEMA_WRITE: NO`, nothing here touches `schema.prisma` or adds a migration, so a database agent had nothing to assert. Release/DevOps — an ordinary task targeting `develop`, with `main` untouched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/backlog-burndown` |
| **Base SHA** | `c1d3d7b0a3555cabac960afee38cddbccc18bd53` |
| **Final Task SHA** | `d63dc4a9cef2b7418c7ee0ca4a5a08b44fde3998` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — `git push origin agent/backlog-burndown:develop`, a fast-forward. No other session moved `develop` while this ran, so the integrated tip is byte-identical to the SHA CI verified rather than a merge commit CI never saw. |
| **Final Target SHA** | `d63dc4a9cef2b7418c7ee0ca4a5a08b44fde3998` — `develop`. `main` untouched. |

### Commits

```
2888e0c fix(api,config): migrations get their own connection, and a behind database says so
edaf3fd fix(web,api): the last two proxies that decided things now forward
be0410a fix(web): a dialog primitive, so the dialog rule can finally be followed
78a7e0a fix(api,landing): a partner referral survives self-service checkout
1c18a0b fix(web,docs): the canonical settings contract matches the code again
cca9744 fix(deps): the critical tar advisory is gone, without the 338-package refresh
4495d28 fix(web,api,config): three backlog items — forwarded errors, an inline assertion, agreeing examples
7d72e2f test(agent-desktop): the app with the most dangerous code gets its first tests
710262f fix(web,admin): the last six native prompts, four of them collecting audited values
9d4f115 chore(api): start the lint burn-down, and give the ceiling a floor
4093055 docs(records): seven bugs closed, six items done, seventeen regressions
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c1d3d7b [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532 [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-backlog                    4093055 [agent/backlog-burndown]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f0 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625 [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661 [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa738 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b [agent/plans-reset]
```

### Files Changed

322 file(s) against `origin/develop`.

```
M	.github/workflows/ci.yml
M	AGENTS.md
M	apps/admin/app/_components/documents/contract-document-editor.tsx
M	apps/admin/app/_components/runtime/runtime-module-list.tsx
M	apps/admin/app/_components/runtime/use-reason-prompt.tsx
M	apps/agent-desktop/AGENTS.md
A	apps/agent-desktop/jest.config.js
M	apps/agent-desktop/package.json
A	apps/agent-desktop/src/main/activity-tracker.spec.ts
A	apps/agent-desktop/src/main/config-manager.spec.ts
A	apps/agent-desktop/src/main/offline-queue.spec.ts
A	apps/agent-desktop/test/electron-stub.ts
A	apps/agent-desktop/test/env-stub.ts
M	apps/agent-desktop/tsconfig.json
M	apps/landing/app/_components/marketing/lead-form-section.tsx
A	apps/landing/app/_components/referral-capture.tsx
M	apps/landing/app/layout.tsx
M	apps/landing/app/subscribe/subscribe-form.tsx
M	apps/landing/lib/onboarding-wizard.ts
A	apps/landing/lib/referral.ts
M	apps/web/.env.example
M	apps/web/app/(authenticated)/attendance/_components/attendance-filter-bar.tsx
M	apps/web/app/(authenticated)/attendance/_components/attendance-record-detail-dialog.tsx
M	apps/web/app/(authenticated)/attendance/exceptions/_components/attendance-exceptions-table.tsx
A	apps/web/app/(authenticated)/payroll/employee-compensation/compensation-runtime.spec.ts
M	apps/web/app/(authenticated)/payroll/employee-compensation/compensation-runtime.ts
M	apps/web/app/(authenticated)/payroll/runs/[runId]/_components/payroll-payments-workspace.tsx
M	apps/web/app/(authenticated)/payroll/runs/[runId]/_components/payroll-run-actions.tsx
M	apps/web/app/(authenticated)/recruitment/_components/cv-upload-parse-flow.tsx
M	apps/web/app/(authenticated)/recruitment/_components/recruitment-applications-board.tsx
M	apps/web/app/(authenticated)/settings/_components/role-designer.tsx
M	apps/web/app/(authenticated)/settings/_components/user-access-management.tsx
M	apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts
A	apps/web/app/(authenticated)/settings/_lib/settings-doc-routes.spec.ts
M	apps/web/app/(authenticated)/settings/customization/_components/columns-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/custom-package-picker-dialog.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/form-designer-workspace.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/forms-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/metadata-components-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/package-detail-shell.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/packages-list.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/tables-list.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/view-designer-workspace.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/views-management.tsx
M	apps/web/app/(authenticated)/settings/integrations/attendance/gateways/_components/pairing-code-dialog.tsx
M	apps/web/app/(authenticated)/settings/integrations/attendance/mapping/_components/mapping-workspace.tsx
M	apps/web/app/(authenticated)/timesheets/_components/timesheet-filter-bar.tsx
M	apps/web/app/(authenticated)/timesheets/_components/timesheet-monthly-editor.tsx
A	apps/web/app/api/_lib/proxy-error.spec.ts
A	apps/web/app/api/_lib/proxy-error.ts
M	apps/web/app/api/agent/settings/route.ts
M	apps/web/app/api/applications/[applicationId]/evaluations/route.ts
M	apps/web/app/api/applications/[applicationId]/stage/route.ts
M	apps/web/app/api/applications/route.ts
M	apps/web/app/api/approval-matrices/[id]/route.ts
M	apps/web/app/api/approval-matrices/route.ts
M	apps/web/app/api/attendance/[entryId]/override/route.ts
M	apps/web/app/api/attendance/[entryId]/route.ts
M	apps/web/app/api/attendance/check-in/route.ts
M	apps/web/app/api/attendance/check-out/route.ts
M	apps/web/app/api/attendance/correction-requests/[id]/approve/route.ts
M	apps/web/app/api/attendance/correction-requests/[id]/reject/route.ts
M	apps/web/app/api/attendance/correction-requests/[id]/route.ts
M	apps/web/app/api/attendance/correction-requests/route.ts
M	apps/web/app/api/attendance/export/route.ts
M	apps/web/app/api/attendance/import/route.ts
M	apps/web/app/api/attendance/integrations/route.ts
M	apps/web/app/api/attendance/manual/route.ts
M	apps/web/app/api/attendance/policy/route.ts
M	apps/web/app/api/attendance/runtime-context/route.ts
M	apps/web/app/api/business-units/[id]/route.ts
M	apps/web/app/api/business-units/route.ts
M	apps/web/app/api/candidates/[candidateId]/documents/[documentId]/parse/route.ts
M	apps/web/app/api/candidates/[candidateId]/documents/route.ts
M	apps/web/app/api/candidates/parse-upload/route.ts
M	apps/web/app/api/candidates/route.ts
M	apps/web/app/api/customization/[...path]/route.ts
M	apps/web/app/api/data-management/exports/[jobId]/status/route.ts
M	apps/web/app/api/data-management/exports/route.ts
M	apps/web/app/api/data-management/imports/[jobId]/cancel/route.ts
M	apps/web/app/api/data-management/imports/[jobId]/execute/route.ts
M	apps/web/app/api/data-management/imports/[jobId]/status/route.ts
M	apps/web/app/api/data-management/imports/route.ts
M	apps/web/app/api/data-management/modules/[moduleKey]/imports/analyse/route.ts
M	apps/web/app/api/departments/[id]/route.ts
M	apps/web/app/api/departments/route.ts
M	apps/web/app/api/documents/[documentId]/route.ts
M	apps/web/app/api/documents/route.ts
M	apps/web/app/api/documents/upload/route.ts
M	apps/web/app/api/employee-levels/[id]/route.ts
M	apps/web/app/api/employee-levels/route.ts
M	apps/web/app/api/employees/[employeeId]/address/route.ts
M	apps/web/app/api/employees/[employeeId]/compensation-history/[id]/components/[componentId]/route.ts
M	apps/web/app/api/employees/[employeeId]/compensation-history/[id]/components/route.ts
M	apps/web/app/api/employees/[employeeId]/compensation/route.ts
M	apps/web/app/api/employees/[employeeId]/documents/[documentId]/route.ts
M	apps/web/app/api/employees/[employeeId]/documents/upload/route.ts
M	apps/web/app/api/employees/[employeeId]/education/[educationId]/route.ts
M	apps/web/app/api/employees/[employeeId]/education/route.ts
M	apps/web/app/api/employees/[employeeId]/emergency-contact/route.ts
M	apps/web/app/api/employees/[employeeId]/history/route.ts
M	apps/web/app/api/employees/[employeeId]/manager/route.ts
M	apps/web/app/api/employees/[employeeId]/personal-info/route.ts
M	apps/web/app/api/employees/[employeeId]/previous-employments/[previousEmploymentId]/route.ts
M	apps/web/app/api/employees/[employeeId]/previous-employments/route.ts
M	apps/web/app/api/employees/[employeeId]/profile-image/upload/route.ts
M	apps/web/app/api/employees/[employeeId]/provision-access/route.ts
M	apps/web/app/api/employees/[employeeId]/reporting-manager/route.ts
M	apps/web/app/api/employees/[employeeId]/resend-invite/route.ts
M	apps/web/app/api/employees/[employeeId]/send-reset-password-link/route.ts
M	apps/web/app/api/employees/[employeeId]/terminate/route.ts
M	apps/web/app/api/employees/duplicate-check/route.ts
M	apps/web/app/api/employees/route.ts
M	apps/web/app/api/leave-policies/[id]/route.ts
M	apps/web/app/api/leave-policies/[id]/rules/[ruleId]/route.ts
M	apps/web/app/api/leave-policies/[id]/rules/route.ts
M	apps/web/app/api/leave-policies/assignments/[id]/route.ts
M	apps/web/app/api/leave-policies/assignments/route.ts
M	apps/web/app/api/leave-policies/route.ts
M	apps/web/app/api/leave-requests/[id]/approve/route.ts
M	apps/web/app/api/leave-requests/[id]/cancel/route.ts
M	apps/web/app/api/leave-requests/[id]/reject/route.ts
M	apps/web/app/api/leave-requests/route.ts
M	apps/web/app/api/leave-types/[id]/route.ts
M	apps/web/app/api/leave-types/route.ts
M	apps/web/app/api/locations/[id]/route.ts
M	apps/web/app/api/locations/route.ts
M	apps/web/app/api/navigation/[...path]/route.ts
M	apps/web/app/api/onboarding/[onboardingId]/convert-to-employee/route.ts
M	apps/web/app/api/onboarding/[onboardingId]/draft-employee/route.ts
M	apps/web/app/api/onboarding/[onboardingId]/tasks/[taskId]/route.ts
M	apps/web/app/api/onboarding/route.ts
M	apps/web/app/api/onboarding/templates/[templateId]/route.ts
M	apps/web/app/api/onboarding/templates/route.ts
M	apps/web/app/api/organizations/[id]/route.ts
M	apps/web/app/api/organizations/route.ts
M	apps/web/app/api/pay-components/[id]/route.ts
M	apps/web/app/api/pay-components/route.ts
M	apps/web/app/api/payroll/calendars/[id]/route.ts
M	apps/web/app/api/payroll/calendars/route.ts
M	apps/web/app/api/payroll/compensations/[compensationId]/route.ts
M	apps/web/app/api/payroll/compensations/route.ts
M	apps/web/app/api/payroll/cycles/[cycleId]/finalize/route.ts
M	apps/web/app/api/payroll/cycles/[cycleId]/generate-drafts/route.ts
M	apps/web/app/api/payroll/cycles/[cycleId]/generate-periods/route.ts
M	apps/web/app/api/payroll/cycles/[cycleId]/preview/route.ts
M	apps/web/app/api/payroll/cycles/[cycleId]/review/route.ts
M	apps/web/app/api/payroll/cycles/route.ts
M	apps/web/app/api/payroll/periods/[id]/route.ts
M	apps/web/app/api/payroll/periods/route.ts
M	apps/web/app/api/payroll/runs/route.ts
M	apps/web/app/api/policies/[id]/route.ts
M	apps/web/app/api/policies/assignments/[id]/route.ts
M	apps/web/app/api/policies/assignments/route.ts
M	apps/web/app/api/policies/route.ts
M	apps/web/app/api/projects/[projectId]/assignments/route.ts
M	apps/web/app/api/projects/[projectId]/route.ts
M	apps/web/app/api/projects/route.ts
M	apps/web/app/api/recruitment/pipelines/[pipelineId]/route.ts
M	apps/web/app/api/recruitment/pipelines/route.ts
M	apps/web/app/api/tenant-settings/branding-assets/route.ts
M	apps/web/app/api/tenant-settings/features/route.ts
M	apps/web/app/api/tenant-settings/organizations/[organizationId]/settings/route.ts
M	apps/web/app/api/tenant-settings/route.ts
M	apps/web/app/api/timesheet-policies/[policyId]/route.ts
M	apps/web/app/api/timesheet-policies/route.ts
M	apps/web/app/api/timesheets/[timesheetId]/approve/route.ts
M	apps/web/app/api/timesheets/[timesheetId]/entries/route.ts
M	apps/web/app/api/timesheets/[timesheetId]/reject/route.ts
M	apps/web/app/api/timesheets/[timesheetId]/submit/route.ts
M	apps/web/app/api/timesheets/entries/[entryId]/route.ts
M	apps/web/app/api/timesheets/entries/route.ts
M	apps/web/app/api/timesheets/mine/monthly/route.ts
M	apps/web/app/api/timesheets/submit/route.ts
M	apps/web/app/api/timesheets/team/[timesheetId]/route.ts
M	apps/web/app/api/users/route.ts
M	apps/web/app/components/data-table/data-table.tsx
M	apps/web/app/components/errors/error-modal.tsx
M	apps/web/app/components/feedback/confirm-dialog.tsx
M	apps/web/app/components/feedback/session-expired-dialog.tsx
A	apps/web/app/components/feedback/use-governed-input.tsx
M	apps/web/app/components/metadata/form-layout-grid.tsx
M	apps/web/app/components/notifications/confirmation-dialog.tsx
M	apps/web/app/components/runtime/module-assign-dialog.tsx
M	apps/web/app/components/runtime/module-command-action-dialog.tsx
M	apps/web/app/components/runtime/module-quick-create-panel.tsx
M	apps/web/app/components/runtime/module-refresh-overlay.tsx
M	apps/web/app/components/runtime/module-related-subgrid.tsx
M	apps/web/app/components/runtime/module-share-dialog.tsx
M	apps/web/app/components/runtime/responsive-runtime-tabs.tsx
M	apps/web/app/components/runtime/runtime-profile-image-card.tsx
A	apps/web/app/components/ui/dialog.tsx
M	apps/web/app/components/ui/form-control.tsx
M	apps/web/eslint.config.mjs
M	apps/web/lib/runtime/modules/standard-module-data.adapter.ts
M	apps/web/lib/runtime/modules/standard-module-runtime.ts
M	docs/architecture/settings-and-branding.md
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md
M	docs/backlog/items/ITEM-0031-replace-remaining-native-prompts-for-governed-input.md
M	docs/backlog/items/ITEM-0033-add-a-test-runner-and-unit-coverage-to-apps-agent-desktop.md
M	docs/backlog/items/ITEM-0035-web-route-handlers-flatten-upstream-error-status-to-500.md
M	docs/backlog/items/ITEM-0042-burn-down-the-services-api-eslint-warning-baseline.md
M	docs/backlog/items/ITEM-0045-reconcile-tenant-web-root-domain-environment-examples.md
M	docs/backlog/items/ITEM-0050-move-payroll-derivation-and-branding-upload-orchestration-out.md
M	docs/backlog/open.md
M	docs/bugs/BUG-0041-web-route-proxies-make-authorization-and-business-decisions.md
M	docs/bugs/BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab.md
M	docs/bugs/BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s.md
M	docs/bugs/BUG-0052-production-dependency-graph-carries-critical-and-high-securi.md
M	docs/bugs/BUG-0086-prisma-migrate-deploy-cannot-acquire-its-advisory-lock-throu.md
M	docs/bugs/BUG-0281-partner-attribution-is-lost-when-a-referred-buyer-purchases-.md
M	docs/bugs/BUG-0283-a-regenerated-prisma-client-against-an-un-migrated-database-.md
M	docs/deployment/environments.md
M	docs/development/ci.md
M	docs/environment-variables.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-AGENT-005-the-desktop-agent-re-sends-a-failed-heartbeat-batch-exactly-.md
A	docs/qa/scenarios/QA-AGENT-006-a-partial-agent-config-cannot-silently-disable-or-widen-what.md
A	docs/qa/scenarios/QA-AGENT-007-a-capability-that-is-off-captures-nothing-from-the-employee-.md
A	docs/qa/scenarios/QA-AUTHZ-012-no-route-proxy-reads-a-permission-or-derives-a-monetary-valu.md
A	docs/qa/scenarios/QA-DEPLOY-018-migrations-connect-over-a-direct-endpoint-never-a-pooler.md
A	docs/qa/scenarios/QA-DEPLOY-019-the-api-names-pending-migrations-at-startup-instead-of-faili.md
A	docs/qa/scenarios/QA-DEPLOY-020-the-two-apps-web-environment-examples-agree-with-each-other-.md
A	docs/qa/scenarios/QA-DEPLOY-021-the-production-dependency-graph-carries-no-critical-advisory.md
A	docs/qa/scenarios/QA-PARTNER-007-a-referred-self-service-purchase-is-attributed-to-its-partne.md
A	docs/qa/scenarios/QA-PAYROLL-001-compensation-submission-carries-the-entered-basic-salary-and.md
A	docs/qa/scenarios/QA-PLATFORM-019-no-value-renders-as-object-object-in-an-error-path.md
A	docs/qa/scenarios/QA-RUNTIME-011-every-route-the-canonical-settings-document-names-resolves.md
A	docs/qa/scenarios/QA-RUNTIME-012-an-api-refusal-reaches-the-browser-as-its-own-status-not-a-5.md
A	docs/qa/scenarios/QA-RUNTIME-013-every-modal-in-the-tenant-product-contains-keyboard-focus.md
A	docs/qa/scenarios/QA-RUNTIME-014-no-governed-value-is-collected-with-a-native-prompt.md
A	docs/qa/scenarios/QA-TENANT-013-a-failed-branding-upload-leaves-no-orphaned-document.md
A	docs/qa/scenarios/QA-TENANT-014-every-tenant-control-plane-method-authorizes-before-it-queri.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-002-authorization.md
M	docs/qa/test-plans/PLAN-006-partner-lifecycle.md
M	docs/qa/test-plans/PLAN-008-agent-desktop.md
M	docs/qa/test-plans/PLAN-010-payroll.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0039-backlog-burn-down-open-bugs-and-ready-items.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package-lock.json
M	package.json
A	packages/config/database-urls.js
A	packages/config/database-urls.test.js
A	packages/config/env-examples.test.js
M	packages/config/index.d.ts
M	packages/config/index.js
M	render.yaml
A	scripts/check-dialogs-are-contained.mjs
M	scripts/check-no-native-prompt.mjs
A	scripts/check-production-advisories.mjs
A	scripts/check-proxies-decide-nothing.mjs
A	scripts/check-proxies-forward-status.mjs
M	services/api/.env.production.example
M	services/api/eslint.config.mjs
M	services/api/prisma.config.ts
M	services/api/src/common/filters/http-exception.filter.ts
M	services/api/src/common/guards/jwt-auth.guard.ts
A	services/api/src/common/prisma/migration-drift.spec.ts
A	services/api/src/common/prisma/migration-drift.ts
M	services/api/src/common/prisma/prisma.service.ts
A	services/api/src/common/utils/display-string.spec.ts
A	services/api/src/common/utils/display-string.ts
M	services/api/src/modules/attendance-integrations/connectors/connector-configuration.validator.ts
M	services/api/src/modules/attendance-integrations/gateways/gateway-runtime.service.ts
M	services/api/src/modules/attendance/attendance.service.ts
M	services/api/src/modules/auth/auth.service.spec.ts
M	services/api/src/modules/billing/billing.module.ts
M	services/api/src/modules/billing/dto/public-subscribe.dto.ts
M	services/api/src/modules/billing/dto/start-onboarding.dto.ts
M	services/api/src/modules/billing/services/billing.service.ts
M	services/api/src/modules/billing/services/checkout-customer-record.spec.ts
M	services/api/src/modules/billing/services/order-activation.service.ts
M	services/api/src/modules/billing/services/seat-change.service.ts
M	services/api/src/modules/billing/services/subscription-order.service.ts
M	services/api/src/modules/data/metadata.service.ts
M	services/api/src/modules/documents/documents.module.ts
M	services/api/src/modules/employees/employees.service.ts
M	services/api/src/modules/error-logs/error-logs.service.ts
M	services/api/src/modules/leads/dto/submit-lead.dto.ts
M	services/api/src/modules/leads/leads.module.ts
M	services/api/src/modules/leads/leads.referral.spec.ts
M	services/api/src/modules/leads/leads.service.ts
M	services/api/src/modules/leads/public-lead-acquisition.spec.ts
M	services/api/src/modules/notifications/lifecycle-notification.handler.ts
M	services/api/src/modules/onboarding/dto/create-employee-onboarding.dto.ts
M	services/api/src/modules/outbox/outbox-dispatcher.service.ts
M	services/api/src/modules/partner-experience/partner-experience.module.ts
A	services/api/src/modules/partner-experience/partner-referral-resolver.service.spec.ts
A	services/api/src/modules/partner-experience/partner-referral-resolver.service.ts
M	services/api/src/modules/payroll/payroll-journal.service.ts
M	services/api/src/modules/payroll/payroll-operations.controller.ts
M	services/api/src/modules/payroll/payroll-run.controller.ts
M	services/api/src/modules/recruitment/recruitment-scoring.service.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
A	services/api/src/modules/tenant-control-plane/every-method-asserts.spec.ts
M	services/api/src/modules/tenant-control-plane/tenant-control-plane.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts
A	services/api/src/modules/tenant-settings/branding-assets.service.spec.ts
A	services/api/src/modules/tenant-settings/branding-assets.service.ts
M	services/api/src/modules/tenant-settings/enterprise-configuration.service.ts
M	services/api/src/modules/tenant-settings/tenant-settings.controller.ts
M	services/api/src/modules/tenant-settings/tenant-settings.module.ts
M	services/api/src/modules/timesheets/timesheet-export.service.ts
M	services/api/src/modules/timesheets/timesheet-exports.controller.ts
M	services/api/src/modules/timesheets/timesheet-generation.service.ts
M	services/api/src/modules/users/user-creation-links-identity.invariant.spec.ts
M	services/api/test/cancellation-retention.e2e-spec.ts
M	services/api/test/legal-seed.e2e-spec.ts
M	turbo.json
```

## Conflicts

None. The branch was cut from `origin/develop` at `c1d3d7b` and no other
session moved `develop` while it ran, so the integration is a fast-forward.

One shared file needed care rather than conflict resolution:
`docs/qa/regressions/index.md` has no allocator and every session appends to
it. The ids were checked against `origin/develop` before writing — it reaches
REG-202 there — and the entries were appended from REG-203. A first pass had
assumed REG-214 and written provisional ids into fourteen test files; those
were renumbered in a single pass, so the overlapping source and target ranges
could not collide.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

Not applicable — there were no conflicts.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` entry: this was a fix campaign against existing records rather than an exploratory QA run. Seventeen reusable scenarios were written instead — `QA-DEPLOY-018` to `021`, `QA-RUNTIME-011` to `014`, `QA-AGENT-005` to `007`, `QA-TENANT-013`/`014`, `QA-PAYROLL-001`, `QA-PARTNER-007`, `QA-PLATFORM-019`, `QA-AUTHZ-012`. |
| **Bug IDs** | Closed: BUG-0041, BUG-0043, BUG-0045, BUG-0052, BUG-0086, BUG-0281, BUG-0283. None created — nothing new was found that was not already recorded. BUG-0163 stays `PRODUCT_DECISION`: its most expensive consequence is gone but the lockfile still cannot be regenerated. |
| **Backlog Items** | Closed: ITEM-0015, ITEM-0031, ITEM-0033, ITEM-0035, ITEM-0045, ITEM-0050. Advanced but left open: ITEM-0042 — a burn-down, not a fix; 1027 warnings to 971 with the ceiling ratcheted 10000 to 975. |

## CI

| | |
|---|---|
| **CI Run ID** | `32556695618` — the run on `d63dc4a`, the exact SHA integrated |
| **CI Result** | PASS — `CI required gate` green, all fourteen jobs beneath it green, including the new `Desktop agent tests` |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

```text
services/api       205 suites, 1634 tests   PASS
apps/web            22 suites,  438 tests   PASS
apps/admin          26 suites,  207 tests   PASS
apps/landing        10 suites,  134 tests   PASS
apps/agent-desktop   3 suites,   48 tests   PASS   (new; the workspace had none)

check-types         api, web, admin, landing, agent-desktop   PASS
lint                api 0 errors / 971 warnings (ceiling 975)
                    web, admin, landing   0 errors

validate:framework  3380 checks   PASS
backlog:check · qa:check · tasks:check · sessions:check   PASS

check-dialogs-are-contained     17 overlays, all contained
check-proxies-decide-nothing    502 handlers
check-proxies-forward-status    507 handler files
check-proxies-forward-refusals  502 handlers
check-no-native-prompt          1519 files, allowlist empty
check-production-advisories     0 critical, 6 dispositioned
check-overrides-applied         PASS
test:env-examples · test:database-urls   PASS
```

Every new check was mutation-tested: a probe carrying the defect it describes
was written, the check was confirmed to refuse it, and the probe was removed.
A check that only asserts a file *mentions* something passes after the
behaviour is deleted, so the probe is the evidence and the green tick is not.

**Not run, and stated rather than implied.** No browser E2E for any of this —
`apps/web` has none at all ([[ITEM-0034]]), so the manual halves of BUG-0043
(Tab cycling, Escape, focus restore, screen-reader announcement) and of
ITEM-0031 (the date and status dialogs) are described in their scenarios and
were not exercised. Neither was the Render deploy for BUG-0086, nor the
packaged Electron archive for BUG-0052 — whose dependency graph this change
alters beneath exclusions verified by extraction the day before, so it should
be re-read when the agent is next packaged.

## Release / Deployment Impact

Reaches no environment. Ordinary task, target `develop`, `main` untouched —
`MAIN_CHANGE_STATUS = UNTOUCHED`. Rollback class: ordinary revert; no
migration, no data change, no schema write.

Two things matter at the *next* deploy, whenever it happens:

- **`DIRECT_DATABASE_URL` is not currently required — corrected 2026-08-22.**
  This said it "must be set on Render before the next production deploy" or
  migrations would still fail. That was wrong, and the evidence came from
  production itself: `prisma migrate status` reports 217 of 217 `main`
  migrations applied, and the host it connected to carries **no `-pooler`
  infix**. Production's `DATABASE_URL` is already the direct endpoint, so
  migrations resolve to it through the fallback and work exactly as before.

  I inferred the pooled configuration from BUG-0086's report rather than
  checking what production is set to now — the same shape of error as the
  Obsidian claim above.

  What remains true is the conditional: **if `DATABASE_URL` is ever moved to
  the pooled endpoint** — which is a reasonable thing to want for runtime
  connection reuse — `DIRECT_DATABASE_URL` must be set first, or migrations
  break. The difference the fix makes is that they now break immediately with a
  message naming the variable, instead of ten seconds later on `P1002` with an
  advisory lock id.
- **The desktop agent's dependency graph changed**: `node-pre-gyp` 1 → 2,
  `node-gyp` 9 → 11, `tar` 6.2.1 → 7.5.22. Verified by a real `npm ci` and an
  audit of the installed tree; **not** verified against a rebuilt `app.asar`,
  which is the check to run before the agent is next shipped.

## Knowledge Capture

The knowledge went into the records rather than into new pattern files,
because every defect fixed was an instance of a pattern already catalogued.
Three gained fresh instances worth reading:

- **`assertion-without-a-check`** — the dominant shape of the whole session.
  Six fixes were rules that already existed in prose and were violated anyway:
  dialogs must trap focus, proxies must decide nothing, proxies must forward
  the error contract, governed input must not use `window.prompt`, every
  control-plane method must assert, the canonical document must match the
  code. In each case the fix was small and the *check* was the work.
- **`doc-code-drift`** — BUG-0045 is the sharpest instance yet, because the
  document that drifted is the one designated to override others, so a reader
  who noticed was instructed to trust the wrong side.
- **`silent-config-fallback`** — BUG-0086 and ITEM-0045 are the same shape at
  opposite severities: a value that resolves to *something* either way, so
  nothing fails loudly. One blocked every production deploy; the other sat
  wrong in a committed example for months because the port was normalised away
  before anything read it.

One lesson is new, and extends the two corrections BUG-0052 already carries:
**when npm refuses to apply an override, the lockfile is still a resolved
graph.** Resolving a subtree in a scratch project and grafting it in nested
moved 12 versions where a full re-resolve moved 338. That is not a general
licence to hand-edit lockfiles — it is a technique for the specific case where
re-resolution is blocked, and it is only defensible because the result was
verified by a real `npm ci` and an audit of the installed tree rather than by
reading the diff.

## Obsidian Sync

`node scripts/generate-dashboards.mjs` ran: the Engineering Dashboard, Product
Dashboard and Engineering Control Center were regenerated and are current, and
`validate:framework` asserts that.

`node scripts/sync-obsidian.mjs` ran, and `npm run knowledge:verify` read the
vault back:

```text
Wrote 123 file(s); 506 already current; 6 skipped as empty
NOTES_VERIFIED                629
WIKILINKS_CHECKED            3130
OBSIDIAN_UNRESOLVED_LINKS       0
OBSIDIAN_GRAPH_ORPHANS          0
OBSIDIAN_PARITY_DIFFS           0
OBSIDIAN_SYNC_STATUS         PASS
```

**Correction.** This section first said the sync "did not run — it needs a local
vault configuration this environment does not have". That was wrong, and wrong in
an avoidable way: a configured `.obsidian-sync.local.json` was sitting in the
primary checkout the whole time, and `obsidian-config.mjs` resolves it from any
worktree precisely so a task worktree does not report `SKIPPED_NO_LOCAL_CONFIG`
against a perfectly good vault. That failure mode is documented at the top of
that file, having already happened to two consecutive framework tasks.

I did not hit it. I assumed it without running the script — which is the same
class of error as the reachability claims BUG-0052 had to correct twice: a
statement about the environment made from expectation rather than from asking
it.

## Cleanup

The task ran in its own worktree at
`D:/My Work/hrm-dijipeople/dijipeople-backlog`, cut from `origin/develop` at
`c1d3d7b`. `session.mjs start` wrote the session record into the *primary*
checkout and warned about it; the record was moved into the task worktree
immediately and the primary confirmed clean. `PRIMARY_WORKTREE_STATUS` was
`CLEAN` at the start and nothing this task did wrote there.

The worktree's `node_modules` is a set of junctions to the primary checkout's,
with the `@repo/*` scope pointed at the *worktree's* own packages so changes to
`packages/config` are visible to the code under test. Untracked; they go with
the worktree.

Worktree removal and branch deletion happen after integration, so they are
recorded in the final report rather than here.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0041]] · [[BUG-0043]] · [[BUG-0045]] · [[BUG-0052]] · [[BUG-0086]] · [[BUG-0163]] · [[BUG-0281]] · [[BUG-0283]] · [[ITEM-0015]] · [[ITEM-0031]] · [[ITEM-0033]] · [[ITEM-0034]] · [[ITEM-0035]] · [[ITEM-0042]] · [[ITEM-0045]] · [[ITEM-0050]] · [[PLAN-002]] · [[PLAN-006]] · [[PLAN-008]] · [[PLAN-010]] · [[PLAN-011]] · [[PLAN-012]] · [[PLAN-019]] · [[QA-AGENT-005]] · [[QA-AGENT-006]] · [[QA-AGENT-007]] · [[QA-AUTHZ-012]] · [[QA-DEPLOY-018]] · [[QA-DEPLOY-019]] · [[QA-DEPLOY-020]] · [[QA-DEPLOY-021]] · [[QA-PARTNER-007]] · [[QA-PAYROLL-001]] · [[QA-PLATFORM-019]] · [[QA-RUNTIME-011]] · [[QA-RUNTIME-012]] · [[QA-RUNTIME-013]] · [[QA-RUNTIME-014]] · [[QA-TENANT-013]] · [[QA-TENANT-014]] · [[SESSION-0039]] · [[TASK-0005]]

<!-- GRAPH:END -->
