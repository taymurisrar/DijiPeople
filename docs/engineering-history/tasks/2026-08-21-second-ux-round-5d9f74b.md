# Engineering History — Second ux round

| | |
|---|---|
| **Task Title** | Second ux round |
| **Task Type** | FEATURE — seven reported items, three of them regressions or a missed fix from the previous round |
| **Date** | 2026-08-21 |
| **Architect Plan** | [TASK-0014](../../tasks/TASK-0014-second-ux-round-lookups-that-stay-lookups-a-notification-pop.md). No ExecPlan: `PLANS.md` requires one for new models, destructive changes, changed uniqueness or relations, or anything needing a backfill — this task has `SCHEMA_WRITE: NO` and touches none of them. |
| **Agents Used** | architect, ui-ux, frontend, backend-api, qa, reviewer, integrator. **Not used:** database (no schema write), security (no auth, permission or tenant-scoping surface changed — the one API change *narrows* what resolves), release/devops (`main` untouched, nothing deployed). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/ux-round-two` |
| **Base SHA** | `3602ec3ac5935b7a047c2e65df2c5c9ac0295dd1` |
| **Final Task SHA** | `5d9f74b1ce8e1fca1b2cf5891554da3ddd9492fa` |
| **Target Branch** | `develop` — `main` is untouched, per the branch model. The generated baseline reads `origin/main` because that is where the worktree's merge-base sits; the integration target is `develop`. |
| **Merge Commit** | None — fast-forward. `git push origin 5d9f74b:refs/heads/develop` moved `develop` from `0d10a9d` to `5d9f74b`, so the integrated SHA and the CI-verified SHA are the same object. |
| **Final Target SHA** | `5d9f74b1ce8e1fca1b2cf5891554da3ddd9492fa` (`origin/develop`) |

### Commits

```
74e8056 docs(bugs): BUG-0086 - migrate deploy cannot lock through Neon's pooler
4226e53 docs(sessions): close SESSION-0024 after BUG-0086 integrated
fc54987 feat(framework): durable work-package state and the continuation pointer
a42fdf5 merge: reconcile origin/main into the task branch so develop regains containment
dc0f524 feat(framework): two permanent roles, the question protocol, and four subsystems
01e1c24 feat(framework): the Obsidian node contract, and evidence that expires correctly
0fac4cd feat(framework): role ownership, the evidence hierarchy, and 23 executing simulations
73e200f feat(framework): the Control Center, the Reviewer, and the completion contract
0b2ae55 fix(obsidian): the node contract found four real defects, and one of them was mine
fefb132 fix(framework): DEVELOP_CONTAINS_MAIN could never go green on the branch that fixed it
dbdae44 feat(repo-health): a concurrent session may dirty the primary checkout mid-task
f023512 fix(finalize): the finalizer could not see the vault from a task worktree
7c82cf5 merge: reconcile the API heap-cap hotfix into develop
dc8c532 docs(framework): TASK-0012 complete — integrated at f023512, gate green
34b699b docs(sessions): close SESSION-0025 and SESSION-0027
22fdbcf fix(agent-desktop): stop shipping native-build tooling to customers
4703112 docs(sessions): close SESSION-0028 after the packaging fix integrated
8362b06 fix(ci): guard silently-ignored npm overrides; BUG-0163 needs an owner decision
0396aba fix(ci): wire check:overrides-applied into package.json
60241ad docs(sessions): register SESSION-0029, which should have existed first
08b8661 docs(backlog): ITEM-0074 — the allocator trusts a session id that may not exist
b59bd81 feat(admin): a default record command bar, a D365 status group, and a plans page that saves
acb14a2 docs(records): four bug records, three regressions and the context they change
cf9ea47 docs(history): SESSION-0030 complete — integrated at acb14a2, gate green
fa45bde fix(billing): a self-service customer record that says what the customer bought
d8d27ab docs(records): four bugs and two decisions from the checkout audit
aab6965 docs(history): SESSION-0031 complete - integrated at d8d27ab, gate green
a339e75 feat(platform): workspace URLs that resolve, a payment you can explain, and row actions that fit
b30e152 feat(admin): a notification feed that means something, and preferences that persist and apply
b8d5d88 feat(landing,admin): field controls that match the data, and a wizard that says where you are
3b77e1b fix(ci): the proxy guard, a redundant enum union, and my own formatting
0d10a9d docs(history): TASK-0013 complete - ten items, integrated at 3b77e1b
043cedf fix(api): one rule decides which workspace a hostname addresses
73aa9cd fix(landing): a country field that stays a list, and a rail that names its steps
b582d18 feat(landing): a features page that reads as a product page
55e238a feat(admin): a notification popover, a paged timeline, and a signature box
e981b1f docs(records): four bugs, three regressions, three scenarios and TASK-0014
b9940c6 docs(knowledge): two new bug patterns, and the hostname rule written down
1488e01 docs(dashboards): regenerate after the two new bug patterns
e375e85 fix(landing): the features contents rail stuck underneath the site header
5d9f74b fix(admin): a wet-ink signature block was captioned by nothing
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            0d10a9d [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532 [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f0 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625 [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661 [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa738 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        5d9f74b [agent/ux-round-two]
```

### Files Changed

257 file(s) against `origin/main`.

```
M	.agent/agents/architect.md
M	.agent/agents/backend-api.md
M	.agent/agents/database.md
M	.agent/agents/frontend.md
M	.agent/agents/integration.md
M	.agent/agents/integrator.md
A	.agent/agents/knowledge-graph.md
A	.agent/agents/product-backlog-steward.md
M	.agent/agents/qa.md
M	.agent/agents/release-devops.md
M	.agent/agents/reviewer.md
M	.agent/agents/security.md
M	.agent/agents/ui-ux.md
M	.agent/context/README.md
M	.agent/context/agent-handoffs.md
A	.agent/context/agent-health.md
A	.agent/context/context-budget.md
A	.agent/context/failure-adaptation.md
A	.agent/context/question-protocol.md
M	.agent/context/repository-health.md
A	.agent/context/research-mode.md
M	.agent/context/runtime-module-system.md
M	.agent/context/task-completion-contract.md
A	.agent/context/test-resource-policy.md
M	.env.development.example
M	.github/workflows/ci.yml
M	AGENTS.md
M	apps/admin/AGENTS.md
M	apps/admin/app/(internal)/invoices/[invoiceId]/page.tsx
M	apps/admin/app/(internal)/layout.tsx
M	apps/admin/app/(internal)/notifications/page.tsx
M	apps/admin/app/(internal)/partner-inquiries/[inquiryId]/page.tsx
M	apps/admin/app/(internal)/partner-onboarding/[applicationId]/page.tsx
M	apps/admin/app/_components/account-preferences-client.tsx
M	apps/admin/app/_components/admin-topbar.tsx
A	apps/admin/app/_components/console-preferences-applier.tsx
A	apps/admin/app/_components/crm/row-actions.tsx
A	apps/admin/app/_components/customers/payment-recheck-panel.tsx
M	apps/admin/app/_components/documents/contract-document-editor.tsx
M	apps/admin/app/_components/documents/contract-template-editor.tsx
M	apps/admin/app/_components/documents/signature-request-detail.tsx
A	apps/admin/app/_components/notifications/notification-bell.tsx
A	apps/admin/app/_components/notifications/notification-model.ts
A	apps/admin/app/_components/notifications/notifications-feed.tsx
M	apps/admin/app/_components/partners/partner-inquiry-review.tsx
M	apps/admin/app/_components/partners/partner-onboarding-review.tsx
A	apps/admin/app/_components/plans/plan-commercial-summary.tsx
A	apps/admin/app/_components/plans/plan-entitlements-panel.tsx
M	apps/admin/app/_components/runtime/module-action-bar.tsx
A	apps/admin/app/_components/runtime/record-command-bar.tsx
A	apps/admin/app/_components/runtime/record-status-group.tsx
M	apps/admin/app/_components/runtime/runtime-form.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
M	apps/admin/app/_components/tenants/tenant-access-panel.tsx
M	apps/admin/app/_components/tenants/tenant-record-header.tsx
M	apps/admin/app/_components/tenants/tenant-timeline-panel.tsx
M	apps/admin/app/api/platform-users/me/preferences/route.ts
A	apps/admin/app/api/platform/events/notifications/read/route.ts
A	apps/admin/app/api/platform/events/notifications/route.ts
A	apps/admin/app/api/super-admin/customers/[customerId]/recheck-payment/route.ts
A	apps/admin/app/api/super-admin/feature-catalog/route.ts
M	apps/admin/app/globals.css
A	apps/admin/lib/console-preferences.ts
A	apps/admin/lib/documents/signature-block.spec.ts
A	apps/admin/lib/documents/signature-block.ts
A	apps/admin/lib/list-paging.spec.ts
A	apps/admin/lib/list-paging.ts
M	apps/admin/lib/runtime/http-module-runtime-adapter.ts
A	apps/admin/lib/runtime/plan-record-form.spec.ts
A	apps/admin/lib/runtime/platform-module-capabilities.spec.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
M	apps/admin/lib/runtime/platform-runtime.types.ts
A	apps/admin/lib/runtime/record-header-status-group.spec.ts
M	apps/admin/lib/runtime/runtime-lookups.ts
A	apps/admin/lib/runtime/runtime-permissions.ts
M	apps/admin/lib/runtime/runtime-record-action-handler.ts
A	apps/admin/lib/runtime/standard-record-commands.ts
A	apps/admin/lib/runtime/use-runtime-lookup-options.ts
A	apps/admin/lib/tenant-url.spec.ts
M	apps/admin/lib/tenant-url.ts
M	apps/agent-desktop/electron-builder.yml
A	apps/landing/app/api/public/geography/countries/route.ts
M	apps/landing/app/features/page.tsx
M	apps/landing/app/subscribe/onboarding-steps.tsx
M	apps/landing/app/subscribe/subscribe-form.tsx
M	apps/landing/lib/onboarding-wizard.spec.ts
M	apps/landing/lib/onboarding-wizard.ts
A	apps/landing/lib/use-country-options.spec.ts
A	apps/landing/lib/use-country-options.ts
M	docs/backlog/blocked.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path.md
M	docs/backlog/items/ITEM-0071-a-terminal-bug-record-may-claim-fixed-while-its-resolution-s.md
A	docs/backlog/items/ITEM-0073-agent-role-names-are-spelled-inconsistently-across-bug-and-t.md
A	docs/backlog/items/ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe.md
A	docs/backlog/items/ITEM-0075-the-subscribe-wizard-never-collects-companysize-which-the-ap.md
A	docs/backlog/items/ITEM-0076-operators-cannot-recover-an-order-whose-stripe-webhook-never.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-0052-production-dependency-graph-carries-critical-and-high-securi.md
M	docs/bugs/BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab.md
A	docs/bugs/BUG-0086-prisma-migrate-deploy-cannot-acquire-its-advisory-lock-throu.md
A	docs/bugs/BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si.md
A	docs/bugs/BUG-0220-saving-a-plan-from-the-runtime-record-page-always-returns-40.md
A	docs/bugs/BUG-0221-schema-completed-form-fields-render-on-a-tab-the-form-never-.md
A	docs/bugs/BUG-0222-plan-related-record-panels-declare-no-tab-so-they-never-rend.md
A	docs/bugs/BUG-0223-admin-cannot-set-a-plan-ispublic-flag-which-gates-self-servi.md
A	docs/bugs/BUG-0280-self-service-checkout-leaves-a-customer-with-no-plan-billing.md
A	docs/bugs/BUG-0281-partner-attribution-is-lost-when-a-referred-buyer-purchases-.md
A	docs/bugs/BUG-0282-the-platform-runtime-schema-manifest-drifted-from-schema-pri.md
A	docs/bugs/BUG-0283-a-regenerated-prisma-client-against-an-un-migrated-database-.md
A	docs/bugs/BUG-0312-provisioning-issues-no-workspace-hostname-when-no-tenant-bas.md
A	docs/bugs/BUG-0313-admin-builds-workspace-urls-from-a-second-divergent-copy-of-.md
A	docs/bugs/BUG-0314-the-notifications-page-is-a-placeholder-under-a-permanently-.md
A	docs/bugs/BUG-0315-workspace-preferences-are-stored-in-localstorage-and-never-a.md
A	docs/bugs/BUG-0316-country-industry-and-contact-fields-are-free-text-where-a-ca.md
A	docs/bugs/BUG-0317-the-subscribe-wizard-shows-five-identical-pills-and-labels-t.md
A	docs/bugs/BUG-0350-the-subscribe-wizard-s-country-field-silently-degraded-to-fr.md
A	docs/bugs/BUG-0351-the-subscribe-wizard-progress-rail-truncated-every-step-labe.md
A	docs/bugs/BUG-0352-the-tenant-timeline-rendered-every-entry-with-no-count-and-n.md
A	docs/bugs/BUG-0353-the-api-resolved-a-workspace-hostname-from-a-variable-nothin.md
A	docs/engineering-history/tasks/2026-08-21-admin-landing-ux-program-3b77e1b.md
A	docs/engineering-history/tasks/2026-08-21-admin-record-status-header-08b8661.md
A	docs/engineering-history/tasks/2026-08-21-checkout-account-and-payment-confirmation-d8d27ab.md
A	docs/engineering-history/tasks/2026-08-21-final-agent-operating-system-upgrade-f023512.md
A	docs/evidence/README.md
A	docs/evidence/ledger.json
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/framework/reconciliation-2026-08-21.md
M	docs/knowledge/modules/contracts-and-agreements.md
M	docs/knowledge/modules/platform-admin.md
M	docs/knowledge/modules/tenant-provisioning.md
M	docs/qa/coverage-matrix.md
M	docs/qa/known-bug-patterns/README.md
M	docs/qa/known-bug-patterns/divergent-duplicate-guard.md
A	docs/qa/known-bug-patterns/silent-degradation.md
A	docs/qa/known-bug-patterns/unbounded-render.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-BILLING-012-a-self-service-customer-record-carries-what-the-customer-bou.md
A	docs/qa/scenarios/QA-CI-003-declared-npm-overrides-are-reflected-in-the-lockfile.md
A	docs/qa/scenarios/QA-LANDING-012-the-country-list-and-the-step-labels-survive-a-lookup-outage.md
A	docs/qa/scenarios/QA-PLATFORM-003-a-plan-form-field-the-api-will-reject-is-never-offered-as-ed.md
A	docs/qa/scenarios/QA-PLATFORM-004-every-module-record-page-offers-the-standard-command-bar-the.md
A	docs/qa/scenarios/QA-PLATFORM-005-no-record-form-field-or-related-panel-renders-on-a-tab-the-f.md
A	docs/qa/scenarios/QA-PLATFORM-006-the-platform-runtime-manifest-is-derived-from-the-current-pr.md
A	docs/qa/scenarios/QA-PLATFORM-007-only-events-that-need-an-operator-reach-the-notification-fee.md
A	docs/qa/scenarios/QA-PLATFORM-008-every-field-control-matches-the-column-behind-it.md
A	docs/qa/scenarios/QA-PLATFORM-009-a-paged-list-clamps-a-page-number-that-outlived-it.md
A	docs/qa/scenarios/QA-TENANT-007-a-workspace-link-resolves-from-one-rule-on-every-surface.md
A	docs/qa/scenarios/QA-TENANT-008-one-rule-decides-which-workspace-a-hostname-addresses.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-007-tenant-provisioning.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/PLAN-013-landing.md
M	docs/qa/test-plans/PLAN-016-seat-billing.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/index.md
A	docs/questions/README.md
A	docs/questions/index.md
A	docs/questions/open.md
A	docs/sessions/SESSION-0024-neon-pooled-endpoint-blocks-prisma-migrate-advisory-lock.md
M	docs/sessions/SESSION-0025-deploy-api-heap-cap-change-to-production.md
A	docs/sessions/SESSION-0026-final-agent-operating-system-upgrade.md
M	docs/sessions/SESSION-0027-hotfix-api-production-heap-cap-to-1536mb.md
A	docs/sessions/SESSION-0028-dependency-security-the-active-win-advisory-chain.md
A	docs/sessions/SESSION-0029-lockfile-resolution-and-the-tar-advisory.md
A	docs/sessions/SESSION-0030-platform-admin-record-header-status-group-and-default-comman.md
A	docs/sessions/SESSION-0031-checkout-customer-account-fidelity-payment-confirmation-and-.md
A	docs/sessions/SESSION-0033-platform-admin-and-landing-ux-program.md
A	docs/sessions/SESSION-0034-landing-ux-modernisation-notification-popover-workspace-host.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md
M	docs/tasks/TASK-0005-dijipeople-global-technical-remediation.md
M	docs/tasks/TASK-0007-commercial-platform-completion-transactional-legal-and-lifec.md
M	docs/tasks/TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-.md
M	docs/tasks/TASK-0009-identity-and-multi-tenant-membership.md
M	docs/tasks/TASK-0010-go-live-readiness.md
M	docs/tasks/TASK-0011-first-production-release.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-01-framework-reconciliation-and-gap-register.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-02-question-escalation-protocol-and-decision-memory.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-03-product-and-backlog-steward.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-04-knowledge-and-graph-agent.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-05-large-task-persistence-and-context-budget.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-06-evidence-cache-and-invalidation.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-07-test-resource-lifecycle-and-cleanup-registry.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-08-agent-role-enhancements.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-09-failure-adaptation-and-research-mode.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-10-agent-health-and-improvement-budget.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-11-control-center-expansion.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-12-behavioural-simulations.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-13-semantic-validation-and-evidence-hierarchy.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-14-reviewer-and-completion-contract.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-15-exact-sha-ci-and-develop-integration.md
A	docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/WP-16-obsidian-projection-and-cleanup.md
A	docs/tasks/TASK-0013-platform-admin-and-landing-ux-program-payment-diagnosis-work.md
A	docs/tasks/TASK-0014-second-ux-round-lookups-that-stay-lookups-a-notification-pop.md
M	docs/tasks/active.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
M	packages/config/platform-domains.js
M	packages/config/platform-domains.test.js
M	packages/config/platform-runtime-schema.generated.json
A	scripts/agent-health.mjs
M	scripts/backlog-review.mjs
A	scripts/check-overrides-applied.mjs
A	scripts/check-work-packages.mjs
A	scripts/evidence.mjs
M	scripts/finalize-agent-task.mjs
M	scripts/generate-dashboards.mjs
M	scripts/generate-platform-runtime-schema.mjs
M	scripts/lib/backlog-records.mjs
A	scripts/lib/evidence-ledger.mjs
M	scripts/lib/id-allocator.mjs
M	scripts/lib/obsidian-mappings.mjs
A	scripts/lib/obsidian-node.mjs
M	scripts/lib/qa-records.mjs
A	scripts/lib/question-records.mjs
M	scripts/lib/task-records.mjs
A	scripts/lib/test-resources.mjs
A	scripts/lib/work-package-records.mjs
A	scripts/new-question.mjs
A	scripts/rebuild-questions.mjs
M	scripts/repo-health.mjs
M	scripts/retrieve-knowledge.mjs
M	scripts/sync-obsidian.mjs
M	scripts/validate-framework.mjs
A	services/api/prisma/migrations/20260821200000_platform_user_console_preferences/migration.sql
A	services/api/prisma/migrations/20260821201000_platform_user_notifications_read_at/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/src/main.ts
M	services/api/src/modules/billing/billing.module.ts
A	services/api/src/modules/billing/services/checkout-customer-record.spec.ts
A	services/api/src/modules/billing/services/payment-diagnosis.spec.ts
A	services/api/src/modules/billing/services/payment-diagnosis.ts
A	services/api/src/modules/billing/services/payment-recheck.service.ts
M	services/api/src/modules/billing/services/subscription-order.service.ts
M	services/api/src/modules/contracts/contracts.domain.spec.ts
M	services/api/src/modules/lookups/lookups.module.ts
A	services/api/src/modules/lookups/public-geography.controller.ts
M	services/api/src/modules/platform-events/platform-events.controller.ts
M	services/api/src/modules/platform-events/platform-events.service.ts
A	services/api/src/modules/platform-events/platform-notifications.spec.ts
A	services/api/src/modules/platform-events/platform-notifications.ts
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
M	services/api/src/modules/platform-users/dto/platform-preferences.dto.ts
M	services/api/src/modules/platform-users/platform-users.service.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
A	services/api/src/modules/tenants/public-tenant-host.spec.ts
M	services/api/src/modules/tenants/public-tenants.service.ts
```

## Conflicts

None. `develop` did not move during the task — it was `0d10a9d` at branch time
and still `0d10a9d` immediately before the ref-push — so integration was a
fast-forward with nothing to reconcile.

## Conflict Resolutions

None required.

Worth recording in their place, because it is the decision this integration
actually turned on: the branch was pushed **four times** before the gate was
asked for a verdict, and each push cancelled the run before it. Three of those
were self-inflicted — a stale generated dashboard, a sticky offset found by
reading the shell rather than the page, and a signature caption that discarded
the field the operator had just typed into. Each was cheaper to fix before
integration than after, and the alternative — integrating on the first green run
and fixing forward — would have put three known defects on `develop` to save
about forty minutes of CI.

## QA

| | |
|---|---|
| **QA Report** | No run record. Findings arrived from the user rather than from a QA sweep, and each became a bug record directly. Coverage is the three scenarios below. |
| **Bug IDs** | BUG-0350, BUG-0351, BUG-0352, BUG-0353 — all created and closed FIXED by this task. |
| **Backlog Items** | None created, advanced or closed. |

## CI

| | |
|---|---|
| **CI Run ID** | [32523288146](https://github.com/taymurisrar/DijiPeople/actions/runs/32523288146), on `5d9f74b` — the exact SHA integrated |
| **CI Result** | PASS — 14 of 14 jobs green, `CI required gate: success`. Three earlier runs on this branch were **cancelled by the next push**, not failed; none of them authorised anything. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `5d9f74b` after `origin/develop` pointed at it. The integration was
a fast-forward, so the merged tree is the tested tree — that makes these a
confirmation rather than a new proof, and it is stated that way rather than
dressed up:

| Command | Result |
|---|---|
| `npm run validate:framework` | PASS — 3196 checks |
| `npm run backlog:check` | PASS — 178 records, 0 structural errors |
| `npm run qa:check` | PASS — 19 plans, 125 scenarios |
| `npm run tasks:check` | PASS — 14 tasks |
| `npm run sessions:check` | PASS — 33 records |
| `npm --workspace admin run test` | PASS — 18 suites, 152 tests |
| `npm --workspace landing run test` | PASS — 8 suites, 119 tests |

On the branch, additionally: `npm --workspace api run test -- public-tenant-host`
(7), `-- contracts.domain` (17), `npm --workspace admin run check-types`,
`landing run check-types`, `api run check-types` (with a 6GB heap; it OOMs at the
default), and ESLint over every changed path in all three workspaces.

**Not run, and not claimed:** nothing was opened in a browser. Six of the seven
items are visual, and the two regressions this task fixes were both invisible to
every test that existed and obvious in a screenshot. The sticky rail in the
contract template editor is the least certain piece — `apps/admin` jest has no
jsdom, so nothing in that app has ever been rendered in a test ([[ITEM-0001]]),
and the shell wraps page content in `overflow-x-hidden`, which makes that
container a scroll container. Whether `position: sticky` engages there is
unverified. If it does not, the rail degrades to an ordinary right-hand column —
still better than the dropdown it replaces, but not what was asked for.

## Release / Deployment Impact

None — not deployed. `main` is at `3602ec3` and was never written to;
`MAIN_CHANGE_STATUS = UNTOUCHED`. No migration, no new environment variable, no
seed change, so the rollback class is a plain revert on `develop`.

One operational note that is not a code change: the country lookup reads
`/api/public/geography/countries`, which was added in the previous round. An API
process started before that endpoint existed answers 404 for it. That no longer
degrades the field — the bundled list stands in — but the full 250-row ISO list
only appears once the API is restarted.

## Knowledge Capture

Two new bug patterns, both observed here rather than imported:

- `docs/qa/known-bug-patterns/silent-degradation.md` — a fallback that swaps the
  **control** rather than its contents, and says nothing, so "did not ship" and
  "shipped and degraded" produce identical screenshots.
- `docs/qa/known-bug-patterns/unbounded-render.md` — a list that renders
  everything it was handed, and the second defect the fix for it introduces:
  paging state that indexes a list a filter can shorten.

Updated:

- `divergent-duplicate-guard.md` — second and third occurrences, and the lesson
  that cost two rounds: when a duplicated rule is consolidated, enumerate every
  **reader** of the concept, not only the writer that was reported, and search by
  concept rather than by variable name.
- `docs/knowledge/modules/tenant-provisioning.md` — a table of the three
  implementations of the hostname rule, which variable each keyed on, and which
  regression removed it.
- `docs/knowledge/modules/contracts-and-agreements.md` — what the sanitiser
  allowlist actually permits, which is the constraint template markup must
  satisfy, and the fact that a `signature.*` token for an unfilled party prints
  literally into an executed agreement.
- `docs/knowledge/modules/platform-admin.md` — the shared console primitives,
  the stacking-order case that looks wrong and is not, and why logic is extracted
  from components in an app that cannot render one in a test.
- The pattern index was missing seven patterns whose files already existed. A
  pattern nobody can find is a pattern nobody applies.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` — 46 notes written, 515 already current, 6
skipped as empty. `node scripts/knowledge-verify.mjs` — **PASS**: 0 vault/repo
diffs, 0 missing provenance, 0 path, node-type or status mismatches, 0 semantic
link errors, 0 duplicates, 0 stale nodes.

It failed the first time, usefully: `silent-degradation` was a `GRAPH_ORPHAN` —
a new note with no inbound or outbound wikilink, unreachable in the graph and
therefore invisible to the retrieval that is the only reason to write a pattern
down. Declared its real relationships ([[BUG-0350]], [[silent-config-fallback]],
[[unbounded-render]]) rather than adding a link to clear the check.

Folders changed: `Agent Knowledge/QA/Bug Patterns`, `Agent Knowledge/Bugs`,
`Agent Knowledge/QA/Scenarios`, `Agent Knowledge/Modules`,
`Agent Knowledge/Sessions`, `Agent Knowledge/Tasks`, `Agent Knowledge/Dashboards`.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-ux2` and branch
`agent/ux-round-two` are **kept**, deliberately: this is a continuing engagement
and the next round starts here rather than paying a fresh `npm ci` again.

`npm run repo:health --main-baseline 3602ec3 --task-branch agent/ux-round-two`:

```
Repository health        PASS
MAIN_SYNC_STATUS         SYNCED
MAIN_CHANGE_STATUS       UNTOUCHED (baseline 3602ec3)
PRIMARY_WORKTREE_STATUS  CLEAN
UNEXPLAINED_DIRTY_FILES  0
OTHER_DIRTY_WORKTREES    0
```

The primary checkout was clean before this task and is clean after it; its local
`develop` was fast-forwarded to the integrated SHA. Five stale worktrees and 52
merged remote branches are reported and left alone — they belong to other
sessions, and this task does not delete what it did not create.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0052]] · [[BUG-0080]] · [[BUG-0086]] · [[BUG-0163]] · [[BUG-0220]] · [[BUG-0221]] · [[BUG-0222]] · [[BUG-0223]] · [[BUG-0280]] · [[BUG-0281]] · [[BUG-0282]] · [[BUG-0283]] · [[BUG-0312]] · [[BUG-0313]] · [[BUG-0314]] · [[BUG-0315]] · [[BUG-0316]] · [[BUG-0317]] · [[BUG-0350]] · [[BUG-0351]] · [[BUG-0352]] · [[BUG-0353]] · [[ITEM-0001]] · [[ITEM-0048]] · [[ITEM-0071]] · [[ITEM-0073]] · [[ITEM-0074]] · [[ITEM-0075]] · [[ITEM-0076]] · [[PLAN-007]] · [[PLAN-012]] · [[PLAN-013]] · [[PLAN-016]] · [[PLAN-019]] · [[QA-BILLING-012]] · [[QA-CI-003]] · [[QA-LANDING-012]] · [[QA-PLATFORM-003]] · [[QA-PLATFORM-004]] · [[QA-PLATFORM-005]] · [[QA-PLATFORM-006]] · [[QA-PLATFORM-007]] · [[QA-PLATFORM-008]] · [[QA-PLATFORM-009]] · [[QA-TENANT-007]] · [[QA-TENANT-008]] · [[SESSION-0024]] · [[SESSION-0025]] · [[SESSION-0026]] · [[SESSION-0027]] · [[SESSION-0028]] · [[SESSION-0029]] · [[SESSION-0030]] · [[SESSION-0031]] · [[SESSION-0033]] · [[SESSION-0034]] · [[TASK-0004]] · [[TASK-0005]] · [[TASK-0007]] · [[TASK-0008]] · [[TASK-0009]] · [[TASK-0010]] · [[TASK-0011]] · [[TASK-0012]] · [[TASK-0013]] · [[TASK-0014]]

<!-- GRAPH:END -->
