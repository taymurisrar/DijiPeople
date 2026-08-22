# Engineering History — Plans catalogue converge

| | |
|---|---|
| **Task Title** | Plans catalogue converge |
| **Task Type** | BUGFIX — asked for as a feature ("delete the plans, set the prices"), and the plans and prices turned out to already exist. What was broken was the mechanism that should have applied them. |
| **Date** | 2026-08-22 |
| **Architect Plan** | [TASK-0018](../../tasks/TASK-0018-legacy-pricing-removed-and-the-commercial-catalogue-made-to-.md). No ExecPlan: no schema change, no migration, nothing deleted. None of `PLANS.md`'s triggers apply. |
| **Agents Used** | architect, backend-api, frontend, qa, reviewer, integrator. **Not used:** database — deliberately, and it is the one worth defending: this task changes what is *in* the tables and not their shape, so there is no migration to review. ui-ux not used; removing a form section is a subtraction. release/devops not used; `main` untouched. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/plans-reset` |
| **Base SHA** | `3602ec3ac5935b7a047c2e65df2c5c9ac0295dd1` |
| **Final Task SHA** | `ffb188c91fccdff70728d085d5dae3aae4fda159` |
| **Target Branch** | `main` |
| **Merge Commit** | None — fast-forward, recorded below. |
| **Final Target SHA** | `ffb188c` — recorded below. |

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
fb7c771 docs(history): TASK-0014 complete — seven items, integrated at 5d9f74b
f202d21 fix(api): a contract that prints values a person can read
166a392 fix(admin): a preview that cannot damage the template, on a canvas with room
1e27436 fix(admin): one word in the shell disabled every sticky element
73418ad fix(admin): a dark theme that repaints the console
451c3dd fix(api,admin): a stuck tenant gets a state, a sentence, and a working button
97f2a4a docs(qa): an output audit for UI/UX, five records, and a suite to run
66663c5 fix(api,admin): a stalled run needs positive evidence, and a state needs a label
a701eeb fix(landing,admin): a locked form that looks locked and says why beside itself
3883798 docs(history): TASK-0015 complete — six defects, integrated at a701eeb
975e506 fix(api,admin): a workspace that says what it is missing, and a repair for it
8a777ab fix(api,admin): an unread count that does not depend on who asks
4589ffe fix(admin): Monitoring opens on Overview, and its metrics do something
e0e7134 fix(landing): an estimator scoped to what headcount changes, and a coded block
f87335d docs(records): four bugs, four regressions, four scenarios and TASK-0016
098a0e6 docs(history): TASK-0016 complete — six items, integrated at f87335d
61f5b9b fix(api): one rule for where a workspace is reachable, and a fifth copy removed
6ae61f9 fix(admin): Open Tenant opens a tab, or says why it did not
6f90812 fix(api,admin): wildcard DNS explained, and reconciled once it is confirmed
042d9f6 fix(admin): the theme is decided before the first paint, not after hydration
4232550 feat(admin): a monitoring page a support agent can start work from
67e7b00 feat(api,admin): Delete that either deletes or says why it will not
0f9addc docs(records): six bugs, six regressions, five scenarios and TASK-0017
99dc70a docs(history): TASK-0017 complete — six items, integrated at 0f9addc
ffb188c feat(api,admin): a price catalogue the database can actually reach
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            99dc70a [develop]
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
D:/My Work/hrm-dijipeople/dijipeople-ux2                        ffb188c [agent/plans-reset]
```

### Files Changed

364 file(s) against `origin/main`.

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
M	apps/admin/app/(internal)/operations/provisioning/provisioning-queue.tsx
M	apps/admin/app/(internal)/partner-inquiries/[inquiryId]/page.tsx
M	apps/admin/app/(internal)/partner-onboarding/[applicationId]/page.tsx
M	apps/admin/app/(internal)/settings/monitoring/page.tsx
M	apps/admin/app/_components/account-preferences-client.tsx
M	apps/admin/app/_components/admin-shell.tsx
M	apps/admin/app/_components/admin-sidebar.tsx
M	apps/admin/app/_components/admin-topbar.tsx
A	apps/admin/app/_components/console-preferences-applier.tsx
A	apps/admin/app/_components/crm/row-actions.tsx
A	apps/admin/app/_components/customers/payment-recheck-panel.tsx
M	apps/admin/app/_components/documents/contract-document-editor.tsx
M	apps/admin/app/_components/documents/contract-template-editor.tsx
M	apps/admin/app/_components/documents/signature-request-detail.tsx
M	apps/admin/app/_components/monitoring/error-logs-table.tsx
A	apps/admin/app/_components/monitoring/monitoring-overview.tsx
A	apps/admin/app/_components/notifications/notification-bell.tsx
A	apps/admin/app/_components/notifications/notification-model.ts
A	apps/admin/app/_components/notifications/notifications-feed.tsx
M	apps/admin/app/_components/partners/partner-inquiry-review.tsx
M	apps/admin/app/_components/partners/partner-onboarding-review.tsx
M	apps/admin/app/_components/plan-price-manager.tsx
A	apps/admin/app/_components/plans/plan-commercial-summary.tsx
A	apps/admin/app/_components/plans/plan-entitlements-panel.tsx
M	apps/admin/app/_components/runtime/module-action-bar.tsx
A	apps/admin/app/_components/runtime/record-command-bar.tsx
A	apps/admin/app/_components/runtime/record-status-group.tsx
M	apps/admin/app/_components/runtime/runtime-form.tsx
M	apps/admin/app/_components/runtime/runtime-module-list.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
M	apps/admin/app/_components/tenants/tenant-access-panel.tsx
M	apps/admin/app/_components/tenants/tenant-control-plane.client.ts
M	apps/admin/app/_components/tenants/tenant-domains-panel.tsx
M	apps/admin/app/_components/tenants/tenant-operations-panel.tsx
M	apps/admin/app/_components/tenants/tenant-record-header.tsx
M	apps/admin/app/_components/tenants/tenant-timeline-panel.tsx
M	apps/admin/app/_components/tenants/use-tenant-record-actions.tsx
M	apps/admin/app/api/platform-users/me/preferences/route.ts
A	apps/admin/app/api/platform/events/notifications/read/route.ts
A	apps/admin/app/api/platform/events/notifications/route.ts
A	apps/admin/app/api/super-admin/customers/[customerId]/recheck-payment/route.ts
A	apps/admin/app/api/super-admin/feature-catalog/route.ts
M	apps/admin/app/globals.css
M	apps/admin/app/layout.tsx
A	apps/admin/lib/console-preferences.ts
A	apps/admin/lib/console-theme-bootstrap.spec.ts
A	apps/admin/lib/console-theme-bootstrap.ts
A	apps/admin/lib/console-theme.spec.ts
A	apps/admin/lib/documents/signature-block.spec.ts
A	apps/admin/lib/documents/signature-block.ts
A	apps/admin/lib/documents/template-preview.spec.ts
A	apps/admin/lib/list-paging.spec.ts
A	apps/admin/lib/list-paging.ts
A	apps/admin/lib/monitoring-metrics.spec.ts
A	apps/admin/lib/monitoring-overview.spec.ts
A	apps/admin/lib/open-external.spec.ts
A	apps/admin/lib/open-external.ts
A	apps/admin/lib/provisioning-queue-states.spec.ts
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
A	apps/admin/lib/source-scan.ts
A	apps/admin/lib/sticky-containment.spec.ts
A	apps/admin/lib/tenant-url.spec.ts
M	apps/admin/lib/tenant-url.ts
M	apps/admin/lib/z-layers.spec.ts
M	apps/agent-desktop/electron-builder.yml
A	apps/landing/app/api/public/geography/countries/route.ts
M	apps/landing/app/features/page.tsx
M	apps/landing/app/plans/plans-experience.tsx
M	apps/landing/app/subscribe/onboarding-steps.tsx
M	apps/landing/app/subscribe/subscribe-form.tsx
M	apps/landing/lib/onboarding-wizard.spec.ts
M	apps/landing/lib/onboarding-wizard.ts
A	apps/landing/lib/plan-estimator.spec.ts
M	apps/landing/lib/plans.spec.ts
M	apps/landing/lib/plans.ts
A	apps/landing/lib/subscribe-lock.spec.ts
A	apps/landing/lib/use-country-options.spec.ts
A	apps/landing/lib/use-country-options.ts
M	apps/landing/next-env.d.ts
M	docs/backlog/blocked.md
M	docs/backlog/completed.md
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
A	docs/bugs/BUG-0418-contract-placeholders-declared-a-formatting-rule-that-nothin.md
A	docs/bugs/BUG-0419-preview-sample-data-replaced-the-live-template-and-rendered-.md
A	docs/bugs/BUG-0420-the-console-dark-theme-set-color-scheme-and-repainted-nothin.md
A	docs/bugs/BUG-0421-an-overflow-declaration-in-the-shell-disabled-every-sticky-e.md
A	docs/bugs/BUG-0422-an-abandoned-provisioning-run-blocked-every-retry-with-no-ro.md
A	docs/bugs/BUG-0439-the-subscribe-form-was-disabled-without-looking-disabled-or-.md
A	docs/bugs/BUG-0460-the-notification-badge-counted-over-a-window-sized-by-the-pa.md
A	docs/bugs/BUG-0461-the-cost-estimator-listed-flat-priced-plans-under-a-headcoun.md
A	docs/bugs/BUG-0462-monitoring-opened-on-a-twelve-thousand-row-queue-with-five-u.md
A	docs/bugs/BUG-0463-an-active-reachable-tenant-reported-that-its-workspace-was-n.md
A	docs/bugs/BUG-0492-the-workspace-url-was-built-by-hand-in-two-more-places.md
A	docs/bugs/BUG-0493-open-tenant-reported-success-while-opening-nothing.md
A	docs/bugs/BUG-0494-workspace-hostnames-stayed-pending-for-ever-with-nothing-to-.md
A	docs/bugs/BUG-0495-the-console-painted-light-on-every-load-before-the-dark-them.md
A	docs/bugs/BUG-0496-the-monitoring-landing-page-showed-real-data-an-agent-could-.md
A	docs/bugs/BUG-0497-fifteen-modules-offered-no-delete-and-no-reason-for-its-abse.md
A	docs/bugs/BUG-0531-flat-prices-were-sellable-on-the-public-site-at-invented-amo.md
A	docs/bugs/BUG-0532-plan-form-offered-editable-legacy-price-fields-that-bill-nob.md
A	docs/bugs/BUG-0533-seeding-the-commercial-catalogue-never-corrected-an-existing.md
A	docs/bugs/BUG-0534-plan-form-offered-editable-legacy-price-fields-that-bill-nob.md
A	docs/engineering-history/tasks/2026-08-21-admin-landing-ux-program-3b77e1b.md
A	docs/engineering-history/tasks/2026-08-21-admin-record-status-header-08b8661.md
A	docs/engineering-history/tasks/2026-08-21-checkout-account-and-payment-confirmation-d8d27ab.md
A	docs/engineering-history/tasks/2026-08-21-final-agent-operating-system-upgrade-f023512.md
A	docs/engineering-history/tasks/2026-08-21-second-ux-round-5d9f74b.md
A	docs/engineering-history/tasks/2026-08-22-document-render-theme-and-tenant-recovery-a701eeb.md
A	docs/engineering-history/tasks/2026-08-22-tenant-commands-monitoring-bulk-delete-0f9addc.md
A	docs/engineering-history/tasks/2026-08-22-tenant-repair-and-console-ux-f87335d.md
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
A	docs/qa/execution-guides/2026-08-22-admin-ux-and-document-rendering.md
A	docs/qa/execution-guides/README.md
M	docs/qa/known-bug-patterns/README.md
M	docs/qa/known-bug-patterns/divergent-duplicate-guard.md
A	docs/qa/known-bug-patterns/silent-degradation.md
A	docs/qa/known-bug-patterns/unbounded-render.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-BILLING-012-a-self-service-customer-record-carries-what-the-customer-bou.md
A	docs/qa/scenarios/QA-CI-003-declared-npm-overrides-are-reflected-in-the-lockfile.md
A	docs/qa/scenarios/QA-CONTRACT-001-a-generated-agreement-prints-values-a-person-can-read.md
A	docs/qa/scenarios/QA-LANDING-012-the-country-list-and-the-step-labels-survive-a-lookup-outage.md
A	docs/qa/scenarios/QA-LANDING-013-a-form-that-cannot-be-submitted-looks-locked-and-says-why.md
A	docs/qa/scenarios/QA-LANDING-014-the-cost-estimator-only-lists-plans-headcount-can-change.md
A	docs/qa/scenarios/QA-PLATFORM-003-a-plan-form-field-the-api-will-reject-is-never-offered-as-ed.md
A	docs/qa/scenarios/QA-PLATFORM-004-every-module-record-page-offers-the-standard-command-bar-the.md
A	docs/qa/scenarios/QA-PLATFORM-005-no-record-form-field-or-related-panel-renders-on-a-tab-the-f.md
A	docs/qa/scenarios/QA-PLATFORM-006-the-platform-runtime-manifest-is-derived-from-the-current-pr.md
A	docs/qa/scenarios/QA-PLATFORM-007-only-events-that-need-an-operator-reach-the-notification-fee.md
A	docs/qa/scenarios/QA-PLATFORM-008-every-field-control-matches-the-column-behind-it.md
A	docs/qa/scenarios/QA-PLATFORM-009-a-paged-list-clamps-a-page-number-that-outlived-it.md
A	docs/qa/scenarios/QA-PLATFORM-010-previewing-sample-data-cannot-change-the-template.md
A	docs/qa/scenarios/QA-PLATFORM-011-the-console-theme-repaints-the-console.md
A	docs/qa/scenarios/QA-PLATFORM-012-nothing-between-a-sticky-element-and-the-viewport-creates-a-.md
A	docs/qa/scenarios/QA-PLATFORM-013-the-unread-notification-count-does-not-depend-on-who-asks.md
A	docs/qa/scenarios/QA-PLATFORM-014-every-monitoring-metric-names-what-it-counts-and-narrows-the.md
A	docs/qa/scenarios/QA-PLATFORM-015-the-console-is-painted-in-the-operator-s-theme-on-the-first-.md
A	docs/qa/scenarios/QA-PLATFORM-016-monitoring-opens-on-work-a-support-agent-can-start.md
A	docs/qa/scenarios/QA-PLATFORM-017-every-list-page-either-deletes-or-says-why-it-will-not.md
A	docs/qa/scenarios/QA-PLATFORM-018-plans-prices-and-the-legacy-pricing-section.md
A	docs/qa/scenarios/QA-TENANT-007-a-workspace-link-resolves-from-one-rule-on-every-surface.md
A	docs/qa/scenarios/QA-TENANT-008-one-rule-decides-which-workspace-a-hostname-addresses.md
A	docs/qa/scenarios/QA-TENANT-009-a-tenant-whose-provisioning-stopped-can-be-recovered-from-th.md
A	docs/qa/scenarios/QA-TENANT-010-a-workspace-states-what-it-is-missing-and-repairs-what-it-ca.md
A	docs/qa/scenarios/QA-TENANT-011-a-workspace-url-resolves-on-every-surface-that-renders-one.md
A	docs/qa/scenarios/QA-TENANT-012-confirming-wildcard-dns-reaches-the-hostnames-already-issued.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-007-tenant-provisioning.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/PLAN-013-landing.md
M	docs/qa/test-plans/PLAN-015-legal.md
M	docs/qa/test-plans/PLAN-016-seat-billing.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
A	docs/qa/test-plans/PLAN-020-billing.md
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
A	docs/sessions/SESSION-0035-document-rendering-fidelity-editor-stability-admin-theme-sti.md
A	docs/sessions/SESSION-0036-tenant-workspace-repair-plan-estimator-notification-count-er.md
A	docs/sessions/SESSION-0037-workspace-url-and-tenant-commands-dns-guidance-monitoring-ov.md
A	docs/sessions/SESSION-0038-plans-reset-legacy-pricing-removed-catalogue-reconciled.md
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
A	docs/tasks/TASK-0015-documents-that-read-like-documents-a-console-theme-that-repa.md
A	docs/tasks/TASK-0016-a-workspace-that-says-what-it-is-missing-metrics-you-can-act.md
A	docs/tasks/TASK-0017-workspace-links-that-resolve-a-monitoring-page-you-can-work-.md
A	docs/tasks/TASK-0018-legacy-pricing-removed-and-the-commercial-catalogue-made-to-.md
M	docs/tasks/active.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	e2e/tests/flow-c-landing-public-surface.spec.ts
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
M	services/api/package.json
A	services/api/prisma/migrations/20260821200000_platform_user_console_preferences/migration.sql
A	services/api/prisma/migrations/20260821201000_platform_user_notifications_read_at/migration.sql
A	services/api/prisma/report-commercial.ts
M	services/api/prisma/schema.prisma
A	services/api/prisma/seed-commercial.ts
M	services/api/prisma/seed-config.ts
M	services/api/src/main.ts
M	services/api/src/modules/billing/billing.module.ts
A	services/api/src/modules/billing/services/checkout-customer-record.spec.ts
A	services/api/src/modules/billing/services/payment-diagnosis.spec.ts
A	services/api/src/modules/billing/services/payment-diagnosis.ts
A	services/api/src/modules/billing/services/payment-recheck.service.ts
M	services/api/src/modules/billing/services/subscription-order.service.ts
M	services/api/src/modules/contracts/contracts.domain.spec.ts
M	services/api/src/modules/contracts/contracts.service.ts
A	services/api/src/modules/contracts/placeholder-formatting.spec.ts
M	services/api/src/modules/lookups/lookups.module.ts
A	services/api/src/modules/lookups/public-geography.controller.ts
A	services/api/src/modules/partners/partner-deletion.service.spec.ts
A	services/api/src/modules/partners/partner-deletion.service.ts
M	services/api/src/modules/partners/partners.module.ts
A	services/api/src/modules/platform-events/notification-count.spec.ts
M	services/api/src/modules/platform-events/platform-events.controller.ts
M	services/api/src/modules/platform-events/platform-events.service.ts
A	services/api/src/modules/platform-events/platform-notifications.spec.ts
A	services/api/src/modules/platform-events/platform-notifications.ts
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
M	services/api/src/modules/platform-users/dto/platform-preferences.dto.ts
M	services/api/src/modules/platform-users/platform-users.service.ts
A	services/api/src/modules/super-admin/commercial-bootstrap.reconcile.spec.ts
M	services/api/src/modules/super-admin/commercial-bootstrap.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
M	services/api/src/modules/tenant-control-plane/provisioning-operations.service.spec.ts
M	services/api/src/modules/tenant-control-plane/provisioning-operations.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-control-plane.controller.ts
M	services/api/src/modules/tenant-control-plane/tenant-control-plane.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-operations.service.ts
A	services/api/src/modules/tenant-control-plane/workspace-health.spec.ts
A	services/api/src/modules/tenant-control-plane/workspace-url.spec.ts
M	services/api/src/modules/tenant-domains/tenant-domain.service.spec.ts
M	services/api/src/modules/tenant-domains/tenant-domain.service.ts
A	services/api/src/modules/tenants/public-tenant-host.spec.ts
M	services/api/src/modules/tenants/public-tenants.service.ts
```

## Conflicts

None. `develop` was `99dc70a` at branch time and unchanged immediately before
the ref-push, so integration was a fast-forward.

## Conflict Resolutions

None required. Two decisions belong here instead, because both are places where
what was asked for and what was built differ.

**"Delete the existing plans" deletes nothing.** `Plan` is referenced by
subscriptions, orders, invoices, leads and customer accounts, and the console
already refuses to delete one — "Archive the plan instead". A literal delete
either fails on a foreign key or cascades through a customer's billing history.
So a plan the catalogue no longer lists is deactivated and archived; one
carrying subscriptions is withdrawn from sale, left running, and reported. The
same asymmetry governs prices: a drifted price is superseded rather than edited,
because an existing subscription points at that row and the terms it was sold
under have to stay readable.

The mechanism is symmetric, which is what makes this reversible rather than
taken on the owner's behalf: anything withdrawn is restored by listing it again
and re-running the seed.

**`enterprise-plus` was kept.** The request named three plans and the catalogue
has four. The fourth carries no price at all — the offer resolver answers
`CUSTOM_CONTRACT_ONLY` for it, which is the honest response to "what does
Enterprise+ cost". Retiring it would remove that answer and leave nothing in its
place. Raised as an outstanding owner decision on TASK-0018 rather than settled
quietly; it is one line and one seed run either way.

## QA

| | |
|---|---|
| **QA Report** | No run record. The finding arrived from the owner; `report-commercial.ts` was written to establish what the database actually held, and its output is the evidence on BUG-0531. Coverage is QA-PLATFORM-018 under the new PLAN-020. |
| **Bug IDs** | BUG-0531, BUG-0533, BUG-0534 created and closed FIXED. BUG-0532 created in error and closed DUPLICATE — a `new-bug` invocation that failed `--type` validation still exited zero, so a shell `&&` chain did not short-circuit. |
| **Backlog Items** | None. |

## CI

| | |
|---|---|
| **CI Run ID** | [32545222644](https://github.com/taymurisrar/DijiPeople/actions/runs/32545222644) on `ffb188c` — the exact SHA integrated. |
| **CI Result** | PASS — 14 of 14 jobs green, `CI required gate: success`, first attempt. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `ffb188c`. A fast-forward, so the merged tree is the tested tree —
a confirmation rather than a new proof:

| Command | Result |
|---|---|
| `npm run validate:framework` | PASS — 3322 checks |
| `npm run backlog:check` | PASS — 198 records, 0 structural errors |
| `npm run qa:check` | PASS — 20 plans, 141 scenarios |
| `npm run tasks:check` | PASS — 18 tasks |
| `npm --workspace api run test` | PASS — 200 suites, 1563 tests |
| `npm --workspace admin run test` | PASS — 26 suites, 207 tests |
| `npm run test:runtime-schema` | PASS |
| `npm --workspace api run check-types` | PASS |
| `npm --workspace admin run check-types` | PASS |
| ESLint over every changed path | PASS — 0 errors, 2 pre-existing warnings |

The two ESLint warnings are `no-unsafe-assignment` on
`definition.enabledFeatureKeys.map` inside `ensurePlans` and
`definition.countryCodes.map` inside `ensureMarkets`. Both are present at HEAD in
identical form and neither line was touched; identified as pre-existing by
diffing against `git show HEAD:` rather than asserted.

**Not run, and not claimed:**

- **The reconcile itself.** `npm run seed:commercial` was refused by a permission
  prompt. Every assertion about convergence runs against a hand-written fake
  Prisma client, which proves which writes happen and with what — and cannot
  enforce the partial unique index `PlanPrice_active_plan_market_cycle_currency_model_key`.
  Disagreeing with that index is the exact root cause of BUG-0030, so this is a
  named gap, recorded as DATABASE coverage on PLAN-020, not an oversight.
- Nothing was opened in a browser. The public pricing page per market is
  QA-PLATFORM-018 steps 7 to 9, manual.
- No Stripe call was made, deliberately — see below.

## Release / Deployment Impact

None — not deployed. `main` is at `3602ec3` and was never written to;
`MAIN_CHANGE_STATUS = UNTOUCHED`. No migration, no new environment variable, no
new dependency. The rollback class is a plain revert on `develop`.

Three operational notes, and the first is the one that matters:

- **The database is unchanged.** This commit gives the seed the ability to
  converge; it does not converge anything by itself. The eight stale rows
  described on BUG-0531 still stand, and `npm run seed:commercial` is what
  applies the catalogue. Nothing here reaches a customer until that runs.
- **`seed:config` now writes where it previously only created**, and it runs on
  every deployment through `release:api`. On the next deploy of any environment
  whose catalogue has drifted, plans will be corrected and prices superseded.
  That is the intent, and it is a behaviour change a deployment note should
  carry. A superseded price is **not checkout-ready** until it is synced to
  Stripe, so a drifted production price would stop being purchasable until an
  operator syncs the successor. This is the correct failure direction —
  unbuyable rather than wrongly priced — and it is not silent: the run warns per
  price and `report:commercial` lists the sync state.
- **No Stripe object is created by any of this.** Syncing is a deliberate
  per-price operator action against a real account. `STRIPE_MODE=test` locally
  would have limited the blast radius; it is still not a seed's decision to
  take.

## Knowledge Capture

In REG-201 and REG-202 rather than in `docs/knowledge/` module files, because
both lessons are about *shape of fix* rather than about a module.

**A seed that only creates is a document, not a mechanism.** The catalogue files
had been correct since 2026-08-20 and no database could reach them. Everything
downstream reported success: the seed counted the stale rows as
`pricesSkippedExisting`, and the only signal anything was wrong was the owner
looking at the plans screen. The distinction the code had not drawn is the one
it now states in a sentence — rows describing **what DijiPeople sells** are
owned by the catalogue and must converge; rows describing **what a customer
bought** are owned by the sale and must never be rewritten.

**The test that matters asserts nothing happens.** A reconciler is easy to write
and easy to get subtly wrong in the direction of rewriting correct rows, which
is worse than not running: `seed:config` executes on every deployment, so a
`Prisma.Decimal` compared against a JavaScript number — never `===`, so drift
forever — would supersede all 36 prices and detach every one of them from Stripe
on each deploy. The idempotence test is the first in the file for that reason.

**Deleting a declaration is not removing a field.** `completeFormsFromSchema`
adds every readable column a form does not mention, so removing the four legacy
declarations moved them into "Additional details" without their labels and made
one of them writable. The first attempt at this fix made the form worse, and the
spec that would have caught it has to assert against the *completed* form —
the earlier version read the declarations, which is exactly the half that was
already correct.

Also recorded on REG-202: `FORM_EXCLUDED_FIELDS` sits above `definitions`
because that array is evaluated at module scope. A constant below it is in its
temporal dead zone and every import of the registry throws at boot. That is the
third time this file has been broken that way, which is why the constant now
carries the reason rather than the commit message.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran twice. The first pass wrote 27 notes and
`knowledge:verify` then failed with five `GRAPH_ORPHAN` errors: the new records
linked regressions as `[[REG-201]]` / `[[REG-202]]`, and regressions live in a
single register file rather than as one note each, so those wikilinks resolved
to nothing. De-bracketed to plain `REG-201` / `REG-202`, which is how every
existing record refers to them; the register itself is still linked. Second pass
wrote 4 notes, `OBSIDIAN_STALE_NODES 0`, verify PASS.

Folders touched: `07 - Bugs/Generated`, `11 - Agent Knowledge/QA`,
`11 - Agent Knowledge/Tasks`, `11 - Agent Knowledge/Sessions`, and the three
dashboards.

## Cleanup

The worktree `dijipeople-ux2` and the branch `agent/plans-reset` are **kept**.
WP-04 is unfinished — the reconcile has not been applied to any database — and
removing the branch that carries it would make resuming harder than it needs to
be.

`PRIMARY_WORKTREE_STATUS = CLEAN`, `UNEXPLAINED_DIRTY_FILES = 0`,
`MAIN_CHANGE_STATUS = UNTOUCHED` against baseline `3602ec3`.
