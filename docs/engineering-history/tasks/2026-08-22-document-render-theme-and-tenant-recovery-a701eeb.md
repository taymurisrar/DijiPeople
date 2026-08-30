# Engineering History — Document render theme and tenant recovery

| | |
|---|---|
| **Task Title** | Document render theme and tenant recovery |
| **Task Type** | BUGFIX — six reported defects, five of them one shape: a mechanism declared, believed, and connected to nothing |
| **Date** | 2026-08-22 |
| **Architect Plan** | [TASK-0015](../../tasks/TASK-0015-documents-that-read-like-documents-a-console-theme-that-repa.md). No ExecPlan: `SCHEMA_WRITE: NO`, and `PLANS.md` requires one for new models, destructive changes, changed uniqueness or relations, or anything needing a backfill — none apply. |
| **Agents Used** | architect, ui-ux, frontend, backend-api, qa, reviewer, integrator. **Not used:** database (no schema write), security (no auth, permission or tenant-scoping surface changed; the tenant change *narrows* nothing and widens nothing — it reclassifies a run), release/devops (`main` untouched, nothing deployed). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/document-render-and-theme` |
| **Base SHA** | `3602ec3ac5935b7a047c2e65df2c5c9ac0295dd1` |
| **Final Task SHA** | `a701eebb123ca9e11f65c3d8f4de566f58053a29` |
| **Target Branch** | `develop`. The generated baseline reads `origin/main` because that is where this worktree's merge-base sits; the integration target is `develop` and `main` was never written to. |
| **Merge Commit** | None — fast-forward. `git push origin a701eeb:refs/heads/develop` moved `develop` from `fb7c771` to `a701eeb`, so the integrated SHA and the CI-verified SHA are the same object. |
| **Final Target SHA** | `a701eebb123ca9e11f65c3d8f4de566f58053a29` (`origin/develop`) |

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
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            fb7c771 [develop]
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
D:/My Work/hrm-dijipeople/dijipeople-ux2                        a701eeb [agent/document-render-and-theme]
```

### Files Changed

292 file(s) against `origin/main`.

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
M	apps/admin/app/_components/account-preferences-client.tsx
M	apps/admin/app/_components/admin-shell.tsx
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
M	apps/admin/app/_components/plan-price-manager.tsx
A	apps/admin/app/_components/plans/plan-commercial-summary.tsx
A	apps/admin/app/_components/plans/plan-entitlements-panel.tsx
M	apps/admin/app/_components/runtime/module-action-bar.tsx
A	apps/admin/app/_components/runtime/record-command-bar.tsx
A	apps/admin/app/_components/runtime/record-status-group.tsx
M	apps/admin/app/_components/runtime/runtime-form.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
M	apps/admin/app/_components/tenants/tenant-access-panel.tsx
M	apps/admin/app/_components/tenants/tenant-control-plane.client.ts
M	apps/admin/app/_components/tenants/tenant-operations-panel.tsx
M	apps/admin/app/_components/tenants/tenant-record-header.tsx
M	apps/admin/app/_components/tenants/tenant-timeline-panel.tsx
M	apps/admin/app/api/platform-users/me/preferences/route.ts
A	apps/admin/app/api/platform/events/notifications/read/route.ts
A	apps/admin/app/api/platform/events/notifications/route.ts
A	apps/admin/app/api/super-admin/customers/[customerId]/recheck-payment/route.ts
A	apps/admin/app/api/super-admin/feature-catalog/route.ts
M	apps/admin/app/globals.css
A	apps/admin/lib/console-preferences.ts
A	apps/admin/lib/console-theme.spec.ts
A	apps/admin/lib/documents/signature-block.spec.ts
A	apps/admin/lib/documents/signature-block.ts
A	apps/admin/lib/documents/template-preview.spec.ts
A	apps/admin/lib/list-paging.spec.ts
A	apps/admin/lib/list-paging.ts
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
A	apps/admin/lib/sticky-containment.spec.ts
A	apps/admin/lib/tenant-url.spec.ts
M	apps/admin/lib/tenant-url.ts
M	apps/agent-desktop/electron-builder.yml
A	apps/landing/app/api/public/geography/countries/route.ts
M	apps/landing/app/features/page.tsx
M	apps/landing/app/subscribe/onboarding-steps.tsx
M	apps/landing/app/subscribe/subscribe-form.tsx
M	apps/landing/lib/onboarding-wizard.spec.ts
M	apps/landing/lib/onboarding-wizard.ts
A	apps/landing/lib/subscribe-lock.spec.ts
A	apps/landing/lib/use-country-options.spec.ts
A	apps/landing/lib/use-country-options.ts
M	apps/landing/next-env.d.ts
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
A	docs/bugs/BUG-0418-contract-placeholders-declared-a-formatting-rule-that-nothin.md
A	docs/bugs/BUG-0419-preview-sample-data-replaced-the-live-template-and-rendered-.md
A	docs/bugs/BUG-0420-the-console-dark-theme-set-color-scheme-and-repainted-nothin.md
A	docs/bugs/BUG-0421-an-overflow-declaration-in-the-shell-disabled-every-sticky-e.md
A	docs/bugs/BUG-0422-an-abandoned-provisioning-run-blocked-every-retry-with-no-ro.md
A	docs/bugs/BUG-0439-the-subscribe-form-was-disabled-without-looking-disabled-or-.md
A	docs/engineering-history/tasks/2026-08-21-admin-landing-ux-program-3b77e1b.md
A	docs/engineering-history/tasks/2026-08-21-admin-record-status-header-08b8661.md
A	docs/engineering-history/tasks/2026-08-21-checkout-account-and-payment-confirmation-d8d27ab.md
A	docs/engineering-history/tasks/2026-08-21-final-agent-operating-system-upgrade-f023512.md
A	docs/engineering-history/tasks/2026-08-21-second-ux-round-5d9f74b.md
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
A	docs/qa/scenarios/QA-TENANT-007-a-workspace-link-resolves-from-one-rule-on-every-surface.md
A	docs/qa/scenarios/QA-TENANT-008-one-rule-decides-which-workspace-a-hostname-addresses.md
A	docs/qa/scenarios/QA-TENANT-009-a-tenant-whose-provisioning-stopped-can-be-recovered-from-th.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-007-tenant-provisioning.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/PLAN-013-landing.md
M	docs/qa/test-plans/PLAN-015-legal.md
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
A	docs/sessions/SESSION-0035-document-rendering-fidelity-editor-stability-admin-theme-sti.md
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
M	services/api/src/modules/platform-events/platform-events.controller.ts
M	services/api/src/modules/platform-events/platform-events.service.ts
A	services/api/src/modules/platform-events/platform-notifications.spec.ts
A	services/api/src/modules/platform-events/platform-notifications.ts
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
M	services/api/src/modules/platform-users/dto/platform-preferences.dto.ts
M	services/api/src/modules/platform-users/platform-users.service.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
M	services/api/src/modules/tenant-control-plane/provisioning-operations.service.spec.ts
M	services/api/src/modules/tenant-control-plane/provisioning-operations.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-operations.service.ts
A	services/api/src/modules/tenants/public-tenant-host.spec.ts
M	services/api/src/modules/tenants/public-tenants.service.ts
```

## Conflicts

None. `develop` was `fb7c771` at branch time and still `fb7c771` immediately
before the ref-push, so integration was a fast-forward with nothing to
reconcile.

## Conflict Resolutions

None required.

The decision this integration actually turned on belongs here instead: **the
first CI run failed, and that was the most useful thing that happened.**

Run 32529295872 on `97f2a4a` reported one failure in Database e2e and one in
Browser e2e. Both were in the STALLED work, and both were invisible to the
fifteen unit assertions shipped with it:

- `deriveProvisioningState` took the activity timestamps as **optional** and
  fell back to `startedAt` when they were absent. The provisioning queue's
  Prisma `select` did not ask for them, so every long-running run in the queue
  was classified STALLED. The unit tests passed the fields directly and could
  never see it.
- The admin queue declares its **own copy** of the state union and did not gain
  STALLED, so `STATE_LABEL[state]` returned `undefined` and the state cell
  rendered empty — in a table whose only purpose is telling six states apart.

The alternative to fixing them here was integrating a green-looking branch and
discovering both from a screenshot. The first is a correctness defect in the
feature's central judgement; the second is a blank cell in an operations table.
Neither is something to fix forward.

Both now have sub-second guards. The union comparison is mutation-tested:
removing STALLED from the frontend fails two of its five assertions.

## QA

| | |
|---|---|
| **QA Report** | No run record. Findings arrived from the user rather than from a QA sweep, and each became a bug record directly. Coverage is the six scenarios below plus the execution guide. |
| **Bug IDs** | BUG-0418, BUG-0419, BUG-0420, BUG-0421, BUG-0422, BUG-0439 — all created and closed FIXED by this task. |
| **Backlog Items** | None created, advanced or closed. [[BUG-0015]] is referenced and deliberately left open. |

## CI

| | |
|---|---|
| **CI Run ID** | [32531018692](https://github.com/taymurisrar/DijiPeople/actions/runs/32531018692) on `a701eeb` — the exact SHA integrated. The earlier run 32529295872 on `97f2a4a` **failed** and authorised nothing; see Conflict Resolutions. |
| **CI Result** | PASS — 14 of 14 jobs green, `CI required gate: success`. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `a701eeb` after `origin/develop` pointed at it. The integration was
a fast-forward, so the merged tree is the tested tree — a confirmation rather
than a new proof, and stated as such:

| Command | Result |
|---|---|
| `npm run validate:framework` | PASS — 3239 checks |
| `npm run backlog:check` | PASS — 184 records, 0 structural errors |
| `npm run qa:check` | PASS — 19 plans, 131 scenarios |
| `npm run tasks:check` | PASS — 15 tasks |
| `npm run sessions:check` | PASS — 34 records |
| `npm --workspace admin run test` | PASS — 22 suites, 173 tests |
| `npm --workspace landing run test` | PASS — 9 suites, 125 tests |
| `npm --workspace api run test` | PASS — 195 suites, 1522 tests |

On the branch, additionally: both frontend typechecks, the API typecheck (with a
6GB heap; it OOMs at the default), and ESLint over every changed path in three
workspaces — zero errors, only pre-existing warnings.

**Not run, and not claimed:** nothing was opened in a browser. Every item here
is visual or interactive. The specs assert decisions, arithmetic and structural
properties of source; they cannot assert a paint, a scroll, a contrast ratio or
a toggle. Two of this task's own defects were caught only because a DB-backed
test and a browser journey exist — which is the argument for the execution
guide, not against the unit coverage.

The least certain items remain the sticky rail (`apps/admin` jest has no jsdom,
and nothing in that app has ever been rendered in a test — [[ITEM-0001]]) and
the dark theme's contrast on individual surfaces.

## Release / Deployment Impact

None — not deployed. `main` is at `3602ec3` and was never written to;
`MAIN_CHANGE_STATUS = UNTOUCHED`. No migration, no new environment variable, no
seed schema change, so the rollback class is a plain revert on `develop`.

Two operational notes that are not code changes:

- The corrected service-order template reaches an install through
  `npm run seed:config`, which rewrites version 1 of a system template
  deliberately. **The API must be restarted afterwards.** Agreements already
  generated keep their stored HTML and are supposed to — an executed document is
  immutable.
- The subscribe form being locked is configuration, not a defect. A price
  becomes checkout-ready when `deriveCheckoutReadiness` has no reasons left; the
  console now lists which of the ten it is failing.

## Knowledge Capture

The durable material this round is in the role definition and the register
rather than in `docs/knowledge/` module files, because what was learned is about
*reviewing*, not about a module.

`.agent/agents/ui-ux.md` gains an **output audit**: never let raw machine data
reach a person; check that a declared format is actually applied; toggle every
toggle twice and check the data afterwards; switch the theme including the third
state and change the machine's theme with the product open; prove that `sticky`
sticks; say what to do rather than only what happened; never disable a control
under a reason that is not true now. Each item names the screen it was found on
and, where one exists, the spec that enforces it.

That last clause is the point. The previous version of the file already said
loading, error and empty states were mandatory, and every defect here shipped
anyway — general advice is satisfied by a general reading.

REG-185 through REG-190 carry the root causes. REG-189's note records the two
CI catches and why the unit tests could not see them.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` — 38 notes written, 538 already current, 6
skipped as empty. `node scripts/knowledge-verify.mjs` — **PASS**: zero
vault/repo diffs, missing provenance, path, node-type or status mismatches,
semantic link errors, duplicates or stale nodes.

Folders changed: `Agent Knowledge/Bugs`, `Agent Knowledge/QA/Scenarios`,
`Agent Knowledge/QA/Bug Patterns`, `Agent Knowledge/Sessions`,
`Agent Knowledge/Tasks`, `Agent Knowledge/Dashboards`.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-ux2` and branch
`agent/document-render-and-theme` are **kept**: this is a continuing engagement
and the next round starts here rather than paying a fresh `npm ci`.

`npm run repo:health --main-baseline 3602ec3 --task-branch
agent/document-render-and-theme`:

```
Repository health        PASS
MAIN_SYNC_STATUS         SYNCED
MAIN_CHANGE_STATUS       UNTOUCHED (baseline 3602ec3)
DEVELOP_SYNC_STATUS      SYNCED
PRIMARY_WORKTREE_STATUS  CLEAN
UNEXPLAINED_DIRTY_FILES  0
OTHER_DIRTY_WORKTREES    0
```

The primary checkout was clean before this task and is clean after it; its local
`develop` was fast-forwarded to the integrated SHA. Stale worktrees and merged
remote branches belonging to other sessions are reported and left alone.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0015]] · [[BUG-0052]] · [[BUG-0080]] · [[BUG-0086]] · [[BUG-0163]] · [[BUG-0220]] · [[BUG-0221]] · [[BUG-0222]] · [[BUG-0223]] · [[BUG-0280]] · [[BUG-0281]] · [[BUG-0282]] · [[BUG-0283]] · [[BUG-0312]] · [[BUG-0313]] · [[BUG-0314]] · [[BUG-0315]] · [[BUG-0316]] · [[BUG-0317]] · [[BUG-0350]] · [[BUG-0351]] · [[BUG-0352]] · [[BUG-0353]] · [[BUG-0418]] · [[BUG-0419]] · [[BUG-0420]] · [[BUG-0421]] · [[BUG-0422]] · [[BUG-0439]] · [[ITEM-0001]] · [[ITEM-0048]] · [[ITEM-0071]] · [[ITEM-0073]] · [[ITEM-0074]] · [[ITEM-0075]] · [[ITEM-0076]] · [[PLAN-007]] · [[PLAN-012]] · [[PLAN-013]] · [[PLAN-015]] · [[PLAN-016]] · [[PLAN-019]] · [[QA-BILLING-012]] · [[QA-CI-003]] · [[QA-CONTRACT-001]] · [[QA-LANDING-012]] · [[QA-LANDING-013]] · [[QA-PLATFORM-003]] · [[QA-PLATFORM-004]] · [[QA-PLATFORM-005]] · [[QA-PLATFORM-006]] · [[QA-PLATFORM-007]] · [[QA-PLATFORM-008]] · [[QA-PLATFORM-009]] · [[QA-PLATFORM-010]] · [[QA-PLATFORM-011]] · [[QA-PLATFORM-012]] · [[QA-TENANT-007]] · [[QA-TENANT-008]] · [[QA-TENANT-009]] · [[SESSION-0024]] · [[SESSION-0025]] · [[SESSION-0026]] · [[SESSION-0027]] · [[SESSION-0028]] · [[SESSION-0029]] · [[SESSION-0030]] · [[SESSION-0031]] · [[SESSION-0033]] · [[SESSION-0034]] · [[SESSION-0035]] · [[TASK-0004]] · [[TASK-0005]] · [[TASK-0007]] · [[TASK-0008]] · [[TASK-0009]] · [[TASK-0010]] · [[TASK-0011]] · [[TASK-0012]] · [[TASK-0013]] · [[TASK-0014]] · [[TASK-0015]]

<!-- GRAPH:END -->
