# Engineering History — Provisioning operations and qa campaign

| | |
|---|---|
| **Task Title** | Provisioning operations and qa campaign |
| **Task Type** | FEATURE (WP-11) + QA campaign (WP-13), which produced two SECURITY bugfixes |
| **Date** | 2026-08-19 |
| **Architect Plan** | [`docs/development/execplan-platform-authorization-boundary.md`](../../development/execplan-platform-authorization-boundary.md) for BUG-0071/BUG-0072. WP-11 needed none: a read-only endpoint and a screen over data already recorded. |
| **Agents Used** | Backend/API, Frontend, UI/UX, QA, Reviewer, Integrator. **Not used:** Database (no schema, migration or query-shape change), Release/DevOps (nothing deployed — WP-15 stays BLOCKED_EXTERNAL). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` at `aa33524` — the header above says `origin/main` because the generator resolves a merge base, and this branch now contains a merge of `develop`. The session record is authoritative. |
| **Task Branch** | `agent/provisioning-ops-and-qa` |
| **Base SHA** | `b90f33e00c3845439797b51ef1ceb3ed7820a620` |
| **Final Task SHA** | `b016441b4971c1b2055e83af15b77c32bd1c4d81` |
| **Target Branch** | `develop` — an ordinary task; `main` is untouched. |
| **Merge Commit** | `b016441` — `develop` merged **into** the task branch. Integration into `develop` itself is pending. |
| **Final Target SHA** | `1f6b508` — fast-forwarded into `develop` on the exact SHA whose gate passed, so `develop` tip is byte-identical to the verified commit rather than an unverified merge. `main` untouched at `b90f33e`. |

### Commits

```
d992088 feat(framework): autonomous framework v2 — sessions, develop integration, persistent QA
da018c4 merge origin/main: regenerate indexes, correct browser-tooling claims
9e437fa docs(backlog): close ITEM-0038 — the id allocator resolves it
f64ba4e chore: regenerate indexes after closing ITEM-0038
cc346b7 docs: QA run, engineering history, Git/CI cost analysis and task finalization
c77933f fix(repo-health): MAIN_CHANGE_STATUS must name who moved main
08a04b3 chore: close SESSION-0001 and finalize TASK-0004
d024cc4 fix(error-logs): scope support-role log reads to the caller's tenant
70ac613 fix(organization): require organization.manage for structure mutations
079e314 fix(employees): separate compensation visibility from employee-record read
8a9109b fix(attendance): bar self-approval and stop readTeam meaning tenant-wide
dcffe6a fix(approvals): scope approvals.readTeam to direct reports, not the tenant
16e36be fix(tenant-settings): require tenant-settings.resolved.read for feature availability
6c67426 fix(ci): clear the services/api lint error baseline and Flow B selector drift
3fe3292 fix(security,ci,obsidian): land the seven authorization fixes, promote API lint, resolve the vault
ee37560 fix(partners): optional website blank no longer blocks a partner inquiry — BUG-0048
fb9524d style(partners): format the BUG-0048 transform
e6a173d ci: promote browser-e2e to a required gate
0051180 docs: QA run, engineering history, and close SESSION-0002 / ITEM-0040 / ITEM-0041
423a7a8 docs(remediation): bootstrap global program inventory
d919e1a Merge commit '423a7a8abe2261f830368a378e0f713391c36f2f' into agent/global-remediation-integration
47b127f chore(records): reconcile remediation evidence
03f30cb docs(qa): record exact CI failure evidence
c554f45 Merge commit '03f30cb74efb6fa12f5f8044eb85590f2361a532' into develop
3f9063f docs(remediation): close WP-02 post-merge evidence
ec9ab59 fix(docs,framework): close the 2026-08-17 drift audit and validate its failure classes
7b2a51d chore(gateway): untrack 1,104 .NET build outputs
c7ce333 docs(bugs): file BUG-0059 — vault wikilinks that resolve to nothing
c0c3f2a fix(framework): close three defects the reviewer pass found in the new checks
a7f99bf Merge pull request #32 from taymurisrar/agent/docs-process-drift-finalization
7ff7b0b fix(security): WP-03 authorization remediation — dual-permission wiring and object-level scope
26eae95 chore(records): reconcile indexes and the TASK-0005 inventory with WP-03
6938444 Merge origin/develop into agent/remediation-authorization
2313bef fix(framework): task records resolve by bare id in Obsidian — BUG-0059 part 1
20ed34f docs(bugs): close the six defects WP-03 fixed, with integrated evidence
7c7b0fc fix(ci): promote the dual-permission invariant and stop report-only false greens — BUG-0049
4386e0f docs(bugs,qa): link regressions the way the vault can resolve
48e3ed0 docs(tasks): record WP-03 done and WP-09's security half, with next-package state
b1c09ac fix(dev): name a stale Prisma client instead of letting it look like 60 code errors — BUG-0060
6dfe5fd fix(knowledge): close BUG-0059 part 2 — vault wikilinks reach zero
151ce14 fix(deps): clear 8 of 20 production advisories without a breaking change — BUG-0052
0138ce9 fix(records): close BUG-0051 and retest the three FIXED-awaiting-QA bugs
4a26560 chore: remove a stray empty file
690036a docs(tasks): persist program state after the terminal and Obsidian packages
5cd12d0 fixes
123a2f3 fix(config): register build inputs and declare workspace imports — BUG-0042, ITEM-0037, ITEM-0024
82353a4 fix(notifications): one email provider catalog instead of two — BUG-0050
f58ee1d docs(tasks): persist queue state after the config and notifications packages
a0ceb3f fix(web): stop route proxies deciding, and give theme one precedence order
1f6e842 fix(framework): make UI/UX participation visible and gated — BUG-0061..0066
6067dad docs(history): record the landing UI/UX pass and the agent hardening
7a9d378 docs(backlog): add the visual-review findings to ITEM-0051
bebf2b9 docs(bugs): correct BUG-0066 — the page does disclose the unavailable region
c332992 docs(sessions): close SESSION-0004
8c35b79 feat(app-releases): build the agent update feed — BUG-0034
c1f1122 docs(backlog): record the active-win investigation and close three of four routes
7dd4c40 style(app-releases): prettier formatting, and correct a stale feed docstring
257622e Merge origin/develop into agent/dependency-and-desktop
ab3bc73 fix(landing): remediate the public surface — BUG-0061..0066, ITEM-0046, ITEM-0051
304bfda docs: close TASK-0006 and SESSION-0005 for the landing remediation
6ebde36 feat(outbox): a transactional outbox so business state and its events commit together — TASK-0007 WP-01
4af2cf0 fix(scripts): make the Prisma freshness check see field drift — BUG-0068
7c97ff2 feat(legal): versioned legal documents, and consent that points at the text it accepted — TASK-0007 WP-02
d02ae6c chore: satisfy the framework inventory, indexes and formatting for the two new modules
78dcdb5 docs(tasks): record WP-01/WP-02 state and the resumption contract for TASK-0007
caa315e Merge remote-tracking branch 'origin/develop' into agent/commercial-platform-completion
bd0fb36 chore: reconcile with develop 4af2cf0 and regenerate the control center
8008fdf test(qa): durable plans and scenarios for the outbox and legal invariants
2bdac3a docs: engineering history and session record for WP-01/WP-02
1fb2bf9 docs: close SESSION-0006 and record the integrated SHA for WP-01/WP-02
42a15d7 fix(outbox): deduplication no longer aborts the caller transaction — BUG-0070
39bd665 feat(billing): the active-employee seat engine — usage history, peak and overage — TASK-0007 WP-04
416996d docs(qa,tasks): PLAN-016 and QA-BILLING-004 for the seat engine; parent state
9886309 docs: close SESSION-0006/0007 and record WP-04 in the reconciliation
2051133 feat(billing): customer before payment, order snapshot and tax basis — TASK-0007 WP-05
68ef4d1 docs(qa,tasks): PLAN-017 and QA-BILLING-005 for pre-payment orders; parent state
9ed77f0 docs: close SESSION-0008 and record WP-05 as integrated
ce9bb56 feat(billing): seat and plan change lifecycle, and the payment to provisioning chain — TASK-0007 WP-06, WP-07
943a826 docs(qa,tasks): PLAN-018 and QA-BILLING-006; correct the reconciliation's R-34 probe
53a2b47 docs: close SESSION-0009 and record WP-06/WP-07 as integrated
99c4b8e feat(billing): cancellation, retention, holds, deletion requests and reconciliation — TASK-0007 WP-08, WP-09
1520b67 docs: ITEM-0054 and parent state for WP-08/WP-09
41b23c6 docs: close SESSION-0010; WP-08/WP-09 integrated, WP-15 established as BLOCKED_EXTERNAL
beae0bc fix(test): reproduce and halve the database e2e failures — ITEM-0047
2d6cf1a docs: close SESSION-0011 for the ITEM-0047 diagnosis
e9cad20 feat(consent,notifications): consent history, lifecycle notifications, serial e2e — TASK-0007 WP-03, WP-12, ITEM-0047 D
884bf96 docs: close SESSION-0012; WP-03/WP-12 done, Obsidian synced and verified
f2957ae feat(landing): the legal, trust and subprocessor surface — TASK-0007 WP-10
aa33524 docs: close SESSION-0013; WP-10 integrated
3f6775e perf(ci): halve CI compute, take build off the critical path, teach the framework to read CI
27eff39 fix(ci): evidence is a property of the required jobs, not the run envelope
42df4a7 feat(framework): Security Agent, Database preflight, and the Obsidian check that was missing
bec5cdf fix(framework): the security knowledge the Security Agent's Required Context names
ac17223 fix(platform-auth,tenant-control-plane): the platform boundary and the provisioning queue — TASK-0007 WP-11, WP-13
5845381 feat(framework): Security Agent, Database preflight, and the Obsidian check that was missing
824af4e fix(framework): the security knowledge the Security Agent's Required Context names
95b3d1f wip: QA graph blocks and security knowledge links
4816ebf feat(obsidian): distinguish SOURCE_ORPHAN from GRAPH_ORPHAN, and close both
b43ee1e docs(qa,knowledge): scenarios, inventory and module notes for the platform boundary — TASK-0007 WP-13
d80c4b4 test(e2e): Flow D — the provisioning queue, driven through the browser — TASK-0007 WP-11, WP-13
43d5b5c feat(framework): autonomy rule, behavioural simulations, DB lifecycle knowledge — and revert my own Playwright cache
574fba1 merge: reconcile the pre-rebase remote tip without a force push
5698cfb docs(knowledge): regenerate the Control Center after the WP-11 status change — TASK-0007 WP-13
98e09b8 feat(framework): Architect Obsidian ownership, and close the loopholes the audit found
9eab6d0 docs: engineering history and SESSION-0016 state for the framework hardening
b8f9e63 docs(dashboard): point the Control Center at the four live-state commands
b6158ce test(e2e): accessibility and layout coverage, with axe — TASK-0007 WP-13
65376a2 test(e2e): Flow F — the public surface's discoverability contract — TASK-0007 WP-13
71a6b04 test(e2e): split Flow E by precondition so the public audit stops skipping — TASK-0007 WP-13
f035bf9 feat(framework): DATABASE_E2E_RED is an owned signal, not a green-gate exemption
494c44d docs(backlog): name the six failing e2e suites and their root-cause groups
4290c03 docs(qa): record accessibility, SEO and provisioning-queue coverage as scenarios — TASK-0007 WP-13
a28d967 fix(admin,e2e): close the accessibility findings and make Flow D actually test its own data — TASK-0007 WP-13
96ec2be docs(tasks): close WP-13 with the campaign result and its honest gaps — TASK-0007
0f6c660 fix(framework): the primary worktree is first-class, and unexplained dirt blocks — BUG-0076
30a931b docs(history): complete the engineering history for BUG-0076
b47e7c6 fix(framework): stop session records emitting a trailing space, and record the newline debt
8cff00f fix(qa,history): REG ids are not wikilinked
484f165 fix(framework): session ownership outranks the pre-existing baseline
cda0033 docs: close SESSION-0017; BUG-0076 integrated at 484f165
19a3a17 fix(qa): renumber this branch REG ids to 066-068 after a collision on develop — TASK-0007 WP-14
b016441 merge: bring develop into agent/provisioning-ops-and-qa — TASK-0007 WP-14
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            cda0033 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       b016441 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                b68c7bf [agent/self-service-onboarding-provisioning]
```

### Files Changed

1775 file(s) against `origin/main`.

```
M	.agent/agents/README.md
M	.agent/agents/architect.md
M	.agent/agents/backend-api.md
M	.agent/agents/database.md
M	.agent/agents/frontend.md
M	.agent/agents/integration.md
M	.agent/agents/integrator.md
M	.agent/agents/qa.md
M	.agent/agents/release-devops.md
M	.agent/agents/reviewer.md
A	.agent/agents/security.md
M	.agent/agents/ui-ux.md
M	.agent/context/README.md
A	.agent/context/agent-handoffs.md
A	.agent/context/branch-model.md
A	.agent/context/ci-operations.md
M	.agent/context/database-prisma.md
M	.agent/context/deployment-runtime.md
M	.agent/context/frontend-architecture.md
A	.agent/context/multi-session.md
A	.agent/context/qa-persistence.md
M	.agent/context/repo-map.md
M	.agent/context/repository-health.md
M	.agent/context/task-completion-contract.md
M	.agent/context/task-router.md
M	.agent/context/testing-architecture.md
M	.github/workflows/ci.yml
M	.gitignore
D	.tmp-landing-err.log
M	AGENTS.md
M	PLANS.md
R100	.tmp-landing-out.log	This
R100	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeop.D7D73DEA.Up2Date	and
A	apps/admin/app/(internal)/operations/provisioning/page.tsx
A	apps/admin/app/(internal)/operations/provisioning/provisioning-queue.tsx
M	apps/admin/app/_components/admin-sidebar.tsx
M	apps/admin/app/_components/dashboard/platform-dashboard.tsx
M	apps/admin/app/_components/runtime/runtime-view-selector.tsx
M	apps/admin/package.json
M	apps/agent-desktop/.env.example
M	apps/agent-desktop/.env.production.example
M	apps/agent-desktop/src/main/api-client.ts
M	apps/agent-desktop/src/main/main.ts
M	apps/agent-desktop/src/main/update-manager.ts
M	apps/docs/package.json
M	apps/landing/AGENTS.md
A	apps/landing/app/_components/header-nav.tsx
M	apps/landing/app/_components/marketing/lead-form-section.tsx
M	apps/landing/app/_components/site-shell.tsx
M	apps/landing/app/about/page.tsx
M	apps/landing/app/contact/contact-form.tsx
M	apps/landing/app/contact/page.tsx
A	apps/landing/app/error.tsx
M	apps/landing/app/features/page.tsx
M	apps/landing/app/globals.css
M	apps/landing/app/layout.tsx
A	apps/landing/app/legal/[slug]/page.tsx
A	apps/landing/app/legal/_components/legal-document-body.tsx
A	apps/landing/app/loading.tsx
A	apps/landing/app/not-found.tsx
M	apps/landing/app/partners/activate/[token]/activation-form.tsx
M	apps/landing/app/partners/activate/[token]/page.tsx
M	apps/landing/app/partners/onboarding/[token]/page.tsx
M	apps/landing/app/partners/page.tsx
M	apps/landing/app/partners/partner-inquiry-form.tsx
M	apps/landing/app/plans/page.tsx
M	apps/landing/app/plans/plans-experience.tsx
M	apps/landing/app/request-demo/page.tsx
M	apps/landing/app/sign/[token]/page.tsx
M	apps/landing/app/sitemap.ts
M	apps/landing/app/subscribe/cancel/page.tsx
M	apps/landing/app/subscribe/page.tsx
M	apps/landing/app/subscribe/subscribe-form.tsx
M	apps/landing/app/subscribe/success/page.tsx
M	apps/landing/lib/commercial-config.ts
A	apps/landing/lib/legal-server.ts
M	apps/landing/lib/plans-server.ts
M	apps/landing/package.json
M	apps/web/app/(authenticated)/_components/resolved-settings-provider.tsx
M	apps/web/app/(authenticated)/settings/_lib/tenant-settings-runtime.adapter.ts
M	apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx
M	apps/web/app/api/attendance/reverse-geocode/route.ts
M	apps/web/app/api/lookups/dashboard-views/route.ts
M	apps/web/app/api/teams/route.ts
M	apps/web/app/components/theme/theme-applier.tsx
M	apps/web/lib/tenant-branding-client.ts
A	apps/web/lib/theme-precedence.spec.ts
M	apps/web/lib/theme.ts
M	apps/web/package.json
M	docs/architecture/database.md
M	docs/backlog/README.md
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md
M	docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md
M	docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md
M	docs/backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md
M	docs/backlog/items/ITEM-0007-should-duplicate-website-leads-be-deduplicated.md
M	docs/backlog/items/ITEM-0008-customeraccount-has-no-origin-channel.md
M	docs/backlog/items/ITEM-0009-no-observability-platform-exists.md
M	docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md
M	docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md
M	docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md
M	docs/backlog/items/ITEM-0013-assert-every-public-controller-is-rate-limited.md
M	docs/backlog/items/ITEM-0016-product-decision-partner-onboarding-review-re-opening-and-po.md
M	docs/backlog/items/ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac.md
M	docs/backlog/items/ITEM-0018-plans-and-prices-have-no-draft-publish-or-archive-lifecycle.md
M	docs/backlog/items/ITEM-0019-no-market-or-region-model-maps-countries-to-plans-currencies.md
M	docs/backlog/items/ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr.md
M	docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md
M	docs/backlog/items/ITEM-0024-landing-depends-on-lucide-react-without-declaring-it.md
M	docs/backlog/items/ITEM-0028-apps-agent-desktop-has-no-agents-md-and-no-test-coverage.md
M	docs/backlog/items/ITEM-0029-validation-should-require-an-aliases-line-on-every-record.md
M	docs/backlog/items/ITEM-0030-partner-inquiry-form-does-not-yet-capture-partnership-model.md
M	docs/backlog/items/ITEM-0031-replace-remaining-native-prompts-for-governed-input.md
M	docs/backlog/items/ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays.md
M	docs/backlog/items/ITEM-0033-add-a-test-runner-and-unit-coverage-to-apps-agent-desktop.md
M	docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md
M	docs/backlog/items/ITEM-0035-web-route-handlers-flatten-upstream-error-status-to-500.md
M	docs/backlog/items/ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md
M	docs/backlog/items/ITEM-0037-apps-web-depends-on-lucide-react-without-declaring-it.md
M	docs/backlog/items/ITEM-0038-record-ids-collide-between-concurrent-branches.md
M	docs/backlog/items/ITEM-0039-promote-the-csp-from-report-only-to-enforced.md
A	docs/backlog/items/ITEM-0040-develop-branch-protection-is-not-applied.md
A	docs/backlog/items/ITEM-0041-repository-ruleset-no-push-matches-no-branch-and-is-inert.md
A	docs/backlog/items/ITEM-0042-burn-down-the-services-api-eslint-warning-baseline.md
A	docs/backlog/items/ITEM-0043-promote-the-security-invariant-job-to-a-required-gate.md
A	docs/backlog/items/ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti.md
A	docs/backlog/items/ITEM-0045-reconcile-tenant-web-root-domain-environment-examples.md
A	docs/backlog/items/ITEM-0046-add-landing-loading-error-and-not-found-boundaries.md
A	docs/backlog/items/ITEM-0047-database-e2e-suites-fail-against-an-ephemeral-postgresql.md
A	docs/backlog/items/ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path.md
A	docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md
A	docs/backlog/items/ITEM-0050-move-payroll-derivation-and-branding-upload-orchestration-out.md
A	docs/backlog/items/ITEM-0051-align-landing-public-form-conventions-and-minor-accessibilit.md
A	docs/backlog/items/ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact.md
A	docs/backlog/items/ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site.md
A	docs/backlog/items/ITEM-0054-contract-placeholder-examples-fabricate-a-saudi-legal-entity.md
A	docs/backlog/items/ITEM-0055-database-e2e-runs-serially-and-now-dominates-its-own-job.md
A	docs/backlog/items/ITEM-0056-ci-cache-hit-rate-is-not-observable-from-the-actions-rest-ap.md
A	docs/backlog/items/ITEM-0057-landing-production-env-examples-still-name-the-vercel-and-re.md
A	docs/backlog/items/ITEM-0058-next-env-d-ts-churns-between-dev-and-build-forms-and-the-fou.md
A	docs/backlog/items/ITEM-0059-49-tracked-text-files-have-no-final-newline-and-nothing-enfo.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-0001-compensation-and-bank-data-behind-employee-record-read.md
M	docs/bugs/BUG-0002-self-approval-of-attendance-corrections.md
M	docs/bugs/BUG-0003-readteam-granted-tenant-wide-visibility.md
M	docs/bugs/BUG-0004-search-filter-overwrote-the-access-scope.md
M	docs/bugs/BUG-0005-cross-tenant-error-log-read-via-support-role.md
M	docs/bugs/BUG-0006-organization-structure-mutable-by-any-authenticated-user.md
M	docs/bugs/BUG-0007-unguarded-duplicate-of-a-permission-gated-route.md
M	docs/bugs/BUG-0009-session-revocation-depended-on-the-refresh-cookie.md
M	docs/bugs/BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500.md
M	docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md
M	docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md
M	docs/bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md
M	docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md
M	docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md
M	docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md
M	docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md
M	docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md
M	docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md
M	docs/bugs/BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-.md
M	docs/bugs/BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in.md
M	docs/bugs/BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-.md
M	docs/bugs/BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron.md
M	docs/bugs/BUG-0029-public-features-page-advertised-capabilities-the-product-doe.md
M	docs/bugs/BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla.md
M	docs/bugs/BUG-0031-public-subscribe-endpoint-has-no-rate-limiting.md
M	docs/bugs/BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b.md
M	docs/bugs/BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro.md
M	docs/bugs/BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no.md
M	docs/bugs/BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token.md
M	docs/bugs/BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p.md
M	docs/bugs/BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi.md
M	docs/bugs/BUG-0038-tenant-commercial-panel-plan-dropdown-405s-and-never-loads.md
M	docs/bugs/BUG-0039-employee-payslip-and-bank-account-proxies-return-the-callers.md
M	docs/bugs/BUG-0040-apps-web-sets-no-security-response-headers.md
M	docs/bugs/BUG-0041-web-route-proxies-make-authorization-and-business-decisions.md
M	docs/bugs/BUG-0042-apps-web-reads-21-environment-variables-unregistered-in-turb.md
M	docs/bugs/BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab.md
M	docs/bugs/BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo.md
M	docs/bugs/BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s.md
M	docs/bugs/BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff.md
A	docs/bugs/BUG-0047-seven-bug-records-are-verified-while-their-fixes-exist-only.md
A	docs/bugs/BUG-0048-partner-inquiry-form-rejects-every-submission-that-leaves-th.md
A	docs/bugs/BUG-0049-report-only-ci-jobs-swallow-security-and-database-e2e-failur.md
A	docs/bugs/BUG-0050-notification-settings-offer-email-providers-whose-backend-al.md
A	docs/bugs/BUG-0051-backlog-and-qa-validators-accept-contradictory-record-state.md
A	docs/bugs/BUG-0052-production-dependency-graph-carries-critical-and-high-securi.md
A	docs/bugs/BUG-0053-documents-self-scoped-users-can-read-tenant-wide-documents.md
A	docs/bugs/BUG-0055-partner-routes-use-tenant-role-aliases-instead-of-platform-permissions.md
A	docs/bugs/BUG-0056-billing-routes-authorize-by-role-instead-of-billing-capability.md
A	docs/bugs/BUG-0057-settings-context-allows-arbitrary-organization-preview.md
A	docs/bugs/BUG-0058-organization-structure-reads-ignore-caller-scope.md
A	docs/bugs/BUG-0059-vault-wikilinks-to-task-records-and-four-module-notes-resolv.md
A	docs/bugs/BUG-0060-stale-generated-prisma-client-breaks-local-api-development.md
A	docs/bugs/BUG-0061-landing-home-and-subscribe-pages-return-500-when-the-plans-f.md
A	docs/bugs/BUG-0062-landing-mobile-navigation-menu-stays-open-after-navigating-a.md
A	docs/bugs/BUG-0063-request-demo-form-blocks-submission-with-no-feedback-and-is-.md
A	docs/bugs/BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra.md
A	docs/bugs/BUG-0065-public-commercial-config-omits-featurecatalog-when-no-market.md
A	docs/bugs/BUG-0066-subscribe-page-renders-an-editable-form-with-no-way-to-submi.md
A	docs/bugs/BUG-0068-prisma-client-freshness-check-is-blind-to-field-level-drift.md
A	docs/bugs/BUG-0070-outbox-deduplication-aborted-the-caller-transaction-on-postg.md
A	docs/bugs/BUG-0071-tenant-users-reach-every-platform-super-admin-endpoint.md
A	docs/bugs/BUG-0072-platform-mutations-map-to-read-permissions-letting-the-read-.md
A	docs/bugs/BUG-0073-small-uppercase-labels-in-slate-400-fail-wcag-aa-contrast-ac.md
A	docs/bugs/BUG-0074-the-provisioning-queue-scroll-container-was-unreachable-by-k.md
A	docs/bugs/BUG-0076-repository-health-never-inspected-the-primary-worktree-so-a-.md
M	docs/bugs/README.md
A	docs/ci/metrics/baseline.json
A	docs/ci/metrics/ci-metrics.md
M	docs/decisions/ADR-0002-tenant-base-domain-single-source.md
M	docs/deployment/incident-response.md
M	docs/development/README.md
M	docs/development/agent-orchestration.md
M	docs/development/branch-protection.md
M	docs/development/browser-e2e.md
M	docs/development/ci-recommendation.md
M	docs/development/ci.md
A	docs/development/database-e2e-reproduction.md
A	docs/development/develop-protection.json
A	docs/development/execplan-platform-authorization-boundary.md
A	docs/development/git-ci-cost.md
A	docs/development/removed-ruleset-15523234.json
A	docs/engineering-history/FINAL-PARENT-SCOPE-RECONCILIATION.md
M	docs/engineering-history/tasks/2026-08-15-autonomous-framework-triage-b2ba383.md
A	docs/engineering-history/tasks/2026-08-16-framework-autonomous-v2-da018c4.md
A	docs/engineering-history/tasks/2026-08-17-framework-remediation-e6a173d.md
A	docs/engineering-history/tasks/2026-08-17-landing-uiux-browser-qa-and-agent-hardening-1f6e842.md
A	docs/engineering-history/tasks/2026-08-18-ci-performance-cancellation-rca-3f6775e.md
A	docs/engineering-history/tasks/2026-08-18-commercial-platform-outbox-and-legal.md
A	docs/engineering-history/tasks/2026-08-18-landing-uiux-remediation-ab3bc73.md
A	docs/engineering-history/tasks/2026-08-18-primary-worktree-repository-health-494c44d.md
A	docs/engineering-history/tasks/2026-08-19-agent-framework-hardening.md
M	docs/environment-variables.md
A	docs/knowledge/architecture/ci-architecture.md
M	docs/knowledge/architecture/database-architecture.md
M	docs/knowledge/architecture/landing-architecture.md
M	docs/knowledge/architecture/qa-and-ci-architecture.md
A	docs/knowledge/architecture/security-architecture.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
A	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/modules/legal.md
A	docs/knowledge/modules/notifications.md
A	docs/knowledge/modules/outbox.md
A	docs/knowledge/modules/platform-auth.md
A	docs/knowledge/modules/platform-communications.md
A	docs/knowledge/modules/super-admin.md
A	docs/knowledge/modules/tenant-isolation.md
A	docs/knowledge/modules/workspace-routing-and-domains.md
M	docs/obsidian-bootstrap/08 - Releases/README.md
M	docs/obsidian-bootstrap/11 - Agent Knowledge/Engineering Rules.md
M	docs/qa/README.md
A	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-16-framework-autonomous-v2-f64ba4e.md
A	docs/qa/runs/2026-08-17-framework-remediation-e6a173d.md
A	docs/qa/runs/2026-08-17-global-remediation-discovery-0051180.md
A	docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
A	docs/qa/runs/2026-08-17-record-state-reconciliation-d919e1a.md
A	docs/qa/runs/2026-08-18-landing-uiux-remediation-verification-c332992.md
A	docs/qa/runs/2026-08-18-primary-worktree-repository-health-494c44d.md
A	docs/qa/scenarios/QA-AGENT-001-desktop-login-does-not-enumerate-accounts.md
A	docs/qa/scenarios/QA-AGENT-002-desktop-request-payloads-satisfy-the-dtos-that-receive-them.md
A	docs/qa/scenarios/QA-AGENT-003-a-replayed-heartbeat-is-not-counted-twice.md
A	docs/qa/scenarios/QA-AGENT-004-the-update-feed-serves-only-verifiable-releases.md
A	docs/qa/scenarios/QA-ATT-001-punch-interpretation-pairs-punches-correctly-across-shift-bo.md
A	docs/qa/scenarios/QA-ATT-002-geofence-evaluation-treats-an-absent-location-as-outside.md
A	docs/qa/scenarios/QA-ATT-003-impossible-travel-between-punches-is-detected.md
A	docs/qa/scenarios/QA-ATT-004-raw-device-ingestion-is-idempotent-under-replay.md
A	docs/qa/scenarios/QA-ATT-005-the-attendance-engine-produces-sessions-end-to-end.md
A	docs/qa/scenarios/QA-ATT-006-an-employee-cannot-approve-their-own-attendance-correction.md
A	docs/qa/scenarios/QA-ATT-007-attendance-operational-workflows-complete-against-a-fresh-da.md
A	docs/qa/scenarios/QA-AUTH-001-every-caller-and-its-auth-route-agree-on-http-method.md
A	docs/qa/scenarios/QA-AUTH-002-sign-out-always-revokes-the-session-and-never-500s-while-cle.md
A	docs/qa/scenarios/QA-AUTH-003-repeated-failed-sign-ins-lock-the-account.md
A	docs/qa/scenarios/QA-AUTH-004-password-policy-is-enforced-on-set-and-on-change.md
A	docs/qa/scenarios/QA-AUTH-005-a-token-minted-for-one-app-client-is-rejected-by-another.md
A	docs/qa/scenarios/QA-AUTHZ-001-every-permission-gated-route-declares-both-permission-famili.md
A	docs/qa/scenarios/QA-AUTHZ-002-no-unguarded-duplicate-of-a-permission-gated-route-exists.md
A	docs/qa/scenarios/QA-AUTHZ-003-a-team-scoped-role-cannot-read-outside-its-subtree.md
A	docs/qa/scenarios/QA-AUTHZ-004-a-search-filter-narrows-the-access-scope-and-never-replaces-.md
A	docs/qa/scenarios/QA-AUTHZ-005-a-permission-change-takes-effect-on-the-next-request.md
A	docs/qa/scenarios/QA-AUTHZ-006-the-rbac-matrix-stays-internally-consistent.md
A	docs/qa/scenarios/QA-AUTHZ-007-organization-structure-mutations-require-explicit-management.md
A	docs/qa/scenarios/QA-AUTHZ-008-route-proxies-forward-upstream-refusals.md
A	docs/qa/scenarios/QA-AUTHZ-009-document-authorization-follows-the-owning-employee.md
A	docs/qa/scenarios/QA-AUTHZ-010-a-tenant-subject-cannot-satisfy-a-platform-permission.md
A	docs/qa/scenarios/QA-AUTHZ-011-a-mutating-platform-route-is-never-satisfied-by-a-read-permi.md
A	docs/qa/scenarios/QA-BILLING-001-billing-reads-and-writes-require-distinct-capabilities.md
A	docs/qa/scenarios/QA-BILLING-002-an-outbox-event-is-delivered-at-least-once-and-consumed-exac.md
A	docs/qa/scenarios/QA-BILLING-003-a-published-legal-version-cannot-be-edited-and-acknowledgeme.md
A	docs/qa/scenarios/QA-BILLING-004-peak-overage-episodes-and-the-abnormal-jump-guard-behave-cor.md
A	docs/qa/scenarios/QA-BILLING-005-a-repeated-subscribe-submission-reuses-the-customer-and-orde.md
A	docs/qa/scenarios/QA-BILLING-006-seat-and-plan-changes-apply-immediately-upward-and-at-renewa.md
A	docs/qa/scenarios/QA-CI-001-report-only-jobs-publish-an-explicit-pass-fail-verdict.md
A	docs/qa/scenarios/QA-DEPLOY-001-deployment-smoke-checks-answer-against-the-deployed-environm.md
A	docs/qa/scenarios/QA-DEPLOY-002-no-url-is-hardcoded-where-configuration-is-required.md
A	docs/qa/scenarios/QA-DEPLOY-003-the-running-api-exposes-the-commit-it-was-built-from.md
A	docs/qa/scenarios/QA-DEPLOY-004-a-release-is-published-with-a-verifiable-artifact-and-sha.md
A	docs/qa/scenarios/QA-DEPLOY-005-the-committed-migration-history-applies-to-an-empty-database.md
A	docs/qa/scenarios/QA-DEPLOY-006-next-apps-ship-the-baseline-security-headers.md
A	docs/qa/scenarios/QA-DEPLOY-007-context-absence-claims-are-rederived-from-the-tree.md
A	docs/qa/scenarios/QA-DEPLOY-008-terminal-bugs-reference-active-regressions-on-the-current-branch.md
A	docs/qa/scenarios/QA-DEPLOY-010-generated-prisma-client-matches-the-schema.md
A	docs/qa/scenarios/QA-DEPLOY-011-every-record-id-resolves-as-a-bare-wikilink-in-the-vault.md
A	docs/qa/scenarios/QA-DEPLOY-012-record-status-disposition-and-evidence-agree.md
A	docs/qa/scenarios/QA-DEPLOY-013-build-inputs-and-workspace-manifests-are-complete.md
A	docs/qa/scenarios/QA-DEPLOY-014-a-stale-generated-prisma-client-is-detected-before-compilati.md
A	docs/qa/scenarios/QA-DEPLOY-015-repository-health-reports-the-primary-worktree-and-blocks-on.md
A	docs/qa/scenarios/QA-LANDING-001-public-pages-degrade-rather-than-500-when-the-plans-api-is-u.md
A	docs/qa/scenarios/QA-LANDING-002-mobile-navigation-dismisses-on-navigation-escape-and-outside.md
A	docs/qa/scenarios/QA-LANDING-003-the-demo-form-reports-validation-errors-accessibly-and-submi.md
A	docs/qa/scenarios/QA-LANDING-004-public-pages-expose-a-skip-link-and-readable-muted-text.md
A	docs/qa/scenarios/QA-LANDING-005-public-commercial-config-returns-one-shape-on-every-branch.md
A	docs/qa/scenarios/QA-LANDING-006-subscribe-never-presents-an-editable-form-it-cannot-submit.md
A	docs/qa/scenarios/QA-LANDING-007-the-public-site-meets-wcag-2-1-aa-on-critical-and-serious-ru.md
A	docs/qa/scenarios/QA-LANDING-008-public-pages-carry-the-metadata-a-crawler-needs-and-the-site.md
A	docs/qa/scenarios/QA-LEAD-001-the-public-lead-endpoint-is-rate-limited.md
A	docs/qa/scenarios/QA-LEAD-002-every-public-write-handler-carries-a-rate-limit-guard.md
A	docs/qa/scenarios/QA-LEAD-003-rate-limiting-identifies-the-visitor-not-the-proxy.md
A	docs/qa/scenarios/QA-LEAD-004-the-public-contact-form-never-fabricates-lead-data.md
A	docs/qa/scenarios/QA-LEAD-005-lead-status-transitions-reject-illegal-moves.md
A	docs/qa/scenarios/QA-ONBOARD-001-a-signed-agreement-cannot-be-edited.md
A	docs/qa/scenarios/QA-ONBOARD-002-onboarding-created-by-lead-conversion-is-born-in-an-editable.md
A	docs/qa/scenarios/QA-ONBOARD-003-commercial-bootstrap-runs-end-to-end-from-lead-to-provisione.md
A	docs/qa/scenarios/QA-ONBOARD-004-the-commercial-onboarding-journey-completes-in-a-real-browser.md
A	docs/qa/scenarios/QA-ONBOARD-005-published-plan-prices-are-the-only-billing-authority.md
A	docs/qa/scenarios/QA-ONBOARD-006-market-configuration-determines-sellable-currency.md
A	docs/qa/scenarios/QA-ONBOARD-007-public-feature-comparisons-use-the-product-catalogue.md
A	docs/qa/scenarios/QA-ONBOARD-008-plan-read-paths-never-bootstrap-pricing.md
A	docs/qa/scenarios/QA-PARTNER-001-partner-onboarding-review-follows-a-state-machine-not-a-sett.md
A	docs/qa/scenarios/QA-PARTNER-002-a-live-partner-cannot-be-demoted-through-the-generic-update-.md
A	docs/qa/scenarios/QA-PARTNER-003-partner-enquiry-acquisition-records-a-distinguishable-partne.md
A	docs/qa/scenarios/QA-PARTNER-004-the-partner-journey-completes-in-a-real-browser.md
A	docs/qa/scenarios/QA-PARTNER-005-an-empty-optional-website-does-not-block-partner-inquiry.md
A	docs/qa/scenarios/QA-PARTNER-006-platform-partner-routes-require-partner-capabilities.md
A	docs/qa/scenarios/QA-PAY-001-payroll-operations-privileges-are-separated-from-employee-re.md
A	docs/qa/scenarios/QA-PAY-002-compensation-formulas-evaluate-deterministically.md
A	docs/qa/scenarios/QA-PAY-003-an-outstanding-loan-deducts-exactly-once-per-run.md
A	docs/qa/scenarios/QA-PAY-004-period-generation-respects-boundaries-without-timezone-drift.md
A	docs/qa/scenarios/QA-PAY-005-payslip-notifications-reach-only-the-payslip-s-owner.md
A	docs/qa/scenarios/QA-PAY-006-an-employee-payslip-proxy-never-returns-the-caller-s-own-rec.md
A	docs/qa/scenarios/QA-PLATFORM-001-the-provisioning-queue-surfaces-every-stuck-run-to-an-operat.md
A	docs/qa/scenarios/QA-PLATFORM-002-platform-admin-screens-carry-no-critical-or-serious-accessib.md
A	docs/qa/scenarios/QA-PROV-001-a-tenant-that-failed-provisioning-can-be-retried.md
A	docs/qa/scenarios/QA-PROV-002-provisioning-is-safe-to-submit-twice.md
A	docs/qa/scenarios/QA-PROV-003-issued-tenant-hostnames-honour-the-configured-base-domain.md
A	docs/qa/scenarios/QA-PROV-004-a-tenant-failing-before-identities-and-billing-is-still-reco.md
A	docs/qa/scenarios/QA-RUNTIME-001-every-declared-runtime-module-has-a-route-that-renders-it.md
A	docs/qa/scenarios/QA-RUNTIME-002-entity-scope-resolution-never-falls-back-to-unscoped.md
A	docs/qa/scenarios/QA-RUNTIME-003-the-entity-query-validator-rejects-filters-it-cannot-safely-.md
A	docs/qa/scenarios/QA-RUNTIME-004-governed-reasons-are-collected-through-the-design-system-nev.md
A	docs/qa/scenarios/QA-RUNTIME-005-a-runtime-module-renders-in-a-real-browser-for-each-access-l.md
A	docs/qa/scenarios/QA-RUNTIME-006-module-workflow-documentation-names-the-live-runtime-path.md
A	docs/qa/scenarios/QA-RUNTIME-010-theme-precedence-and-proxy-neutrality.md
A	docs/qa/scenarios/QA-SETTINGS-001-resolved-settings-reject-arbitrary-context-preview.md
A	docs/qa/scenarios/QA-SETTINGS-002-email-providers-offered-are-providers-implemented.md
A	docs/qa/scenarios/QA-TENANT-001-the-two-tenant-isolation-pattern-scoped-read-and-scoped-writ.md
A	docs/qa/scenarios/QA-TENANT-002-a-support-role-cannot-read-another-tenant-s-error-logs.md
A	docs/qa/scenarios/QA-TENANT-003-attendance-integration-credentials-never-cross-a-tenant-boun.md
A	docs/qa/scenarios/QA-TENANT-004-workspace-domain-resolution-cannot-be-pointed-at-another-ten.md
A	docs/qa/scenarios/QA-TENANT-005-tenant-erasure-removes-rows-in-dependency-order-and-leaves-n.md
A	docs/qa/scenarios/index.md
A	docs/qa/test-plans/PLAN-001-authentication.md
A	docs/qa/test-plans/PLAN-002-authorization.md
A	docs/qa/test-plans/PLAN-003-tenant-isolation.md
A	docs/qa/test-plans/PLAN-004-commercial-onboarding.md
A	docs/qa/test-plans/PLAN-005-lead-management.md
A	docs/qa/test-plans/PLAN-006-partner-lifecycle.md
A	docs/qa/test-plans/PLAN-007-tenant-provisioning.md
A	docs/qa/test-plans/PLAN-008-agent-desktop.md
A	docs/qa/test-plans/PLAN-009-attendance.md
A	docs/qa/test-plans/PLAN-010-payroll.md
A	docs/qa/test-plans/PLAN-011-runtime-modules.md
A	docs/qa/test-plans/PLAN-012-deployment-release.md
A	docs/qa/test-plans/PLAN-013-landing.md
A	docs/qa/test-plans/PLAN-014-outbox.md
A	docs/qa/test-plans/PLAN-015-legal.md
A	docs/qa/test-plans/PLAN-016-seat-billing.md
A	docs/qa/test-plans/PLAN-017-subscription-orders.md
A	docs/qa/test-plans/PLAN-018-subscription-changes.md
A	docs/qa/test-plans/PLAN-019-platform-admin.md
A	docs/qa/test-plans/index.md
M	docs/qa/test-strategy/e2e-suite-classification.md
A	docs/sessions/README.md
A	docs/sessions/SESSION-0001-autonomous-framework-v2-multi-session-develop-integration-pe.md
A	docs/sessions/SESSION-0002-final-framework-remediation-and-ci-debt.md
A	docs/sessions/SESSION-0003-dijipeople-global-technical-remediation.md
A	docs/sessions/SESSION-0004-quick-landing-ui-ux-browser-qa-pass-and-ui-ux-agent-hardenin.md
A	docs/sessions/SESSION-0005-landing-ui-ux-remediation-bug-0061-0066-item-0051-item-0046.md
A	docs/sessions/SESSION-0006-commercial-platform-final-parent-completion.md
A	docs/sessions/SESSION-0007-commercial-platform-completion-wp-04-onward-with-real-postgr.md
A	docs/sessions/SESSION-0008-commercial-platform-wp-05-customer-before-payment-checkout-a.md
A	docs/sessions/SESSION-0009-commercial-platform-wp-06-and-wp-07-seat-plan-change-and-pro.md
A	docs/sessions/SESSION-0010-commercial-platform-wp-08-wp-09-wp-12-cancellation-retention.md
A	docs/sessions/SESSION-0011-item-0047-database-e2e-determinism.md
A	docs/sessions/SESSION-0012-wp-03-wp-12-wp-10-wp-16-and-item-0047-cause-d.md
A	docs/sessions/SESSION-0013-wp-10-landing-legal-trust-and-subprocessor-surface.md
A	docs/sessions/SESSION-0014-ci-performance-cancellation-rca-and-autonomous-ci-adaptation.md
A	docs/sessions/SESSION-0016-database-agent-security-agent-agent-reliability-and-obsidian.md
A	docs/sessions/SESSION-0017-primary-worktree-repository-health-ownership.md
A	docs/sessions/active.md
A	docs/sessions/completed.md
A	docs/sessions/index.md
M	docs/tasks/TASK-0001-framework-keyword-routing-task-orchestration-and-repository-.md
M	docs/tasks/TASK-0002-deep-documentation-of-apps-docs-apps-landing-and-apps-agent-.md
M	docs/tasks/TASK-0003-deep-documentation-of-apps-web-the-tenant-product.md
A	docs/tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md
A	docs/tasks/TASK-0005-dijipeople-global-technical-remediation.md
A	docs/tasks/TASK-0006-landing-ui-ux-remediation-package.md
A	docs/tasks/TASK-0007-commercial-platform-completion-transactional-legal-and-lifec.md
M	docs/tasks/active.md
M	docs/tasks/blocked.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
A	docs/tasks/remediation/TASK-0005-inventory.json
A	e2e/fixtures/accessibility.ts
M	e2e/fixtures/admin-session.ts
M	e2e/fixtures/environment.ts
A	e2e/global-setup.ts
M	e2e/package.json
M	e2e/playwright.config.ts
M	e2e/tests/flow-b-partner-journey.spec.ts
A	e2e/tests/flow-c-landing-public-surface.spec.ts
A	e2e/tests/flow-d-provisioning-operations.spec.ts
A	e2e/tests/flow-e-accessibility-and-layout.spec.ts
A	e2e/tests/flow-f-public-seo.spec.ts
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/DijiPeople.Gateway.deps.json
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/DijiPeople.Gateway.exe
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/DijiPeople.Gateway.runtimeconfig.json
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.CSharp.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Data.Sqlite.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.DiaSymReader.Native.amd64.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Binder.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.CommandLine.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.EnvironmentVariables.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.FileExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.UserSecrets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Physical.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileSystemGlobbing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.WindowsServices.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Http.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Debug.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventLog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Options.ConfigurationExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Options.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Extensions.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.VisualBasic.Core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.VisualBasic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Win32.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Microsoft.Win32.Registry.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/SQLitePCLRaw.batteries_v2.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/SQLitePCLRaw.core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/SQLitePCLRaw.provider.e_sqlite3.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Serilog.Extensions.Hosting.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Serilog.Extensions.Logging.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Serilog.Sinks.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Serilog.Sinks.File.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/Serilog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.AppContext.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Buffers.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Collections.Concurrent.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Collections.Immutable.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Collections.NonGeneric.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Collections.Specialized.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Collections.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ComponentModel.Annotations.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ComponentModel.DataAnnotations.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ComponentModel.EventBasedAsync.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ComponentModel.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ComponentModel.TypeConverter.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ComponentModel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Data.Common.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Data.DataSetExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Data.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.Contracts.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.Debug.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.DiagnosticSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.EventLog.Messages.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.EventLog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.FileVersionInfo.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.Process.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.StackTrace.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.TextWriterTraceListener.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.Tools.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.TraceSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Diagnostics.Tracing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Drawing.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Drawing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Dynamic.Runtime.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Formats.Asn1.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Formats.Tar.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Globalization.Calendars.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Globalization.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Globalization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.Compression.Brotli.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.Compression.FileSystem.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.Compression.Native.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.Compression.ZipFile.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.Compression.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.FileSystem.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.FileSystem.DriveInfo.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.FileSystem.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.FileSystem.Watcher.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.FileSystem.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.IsolatedStorage.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.MemoryMappedFiles.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.Pipes.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.Pipes.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.UnmanagedMemoryStream.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.IO.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Linq.Expressions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Linq.Parallel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Linq.Queryable.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Memory.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Http.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Http.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.HttpListener.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Mail.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.NameResolution.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.NetworkInformation.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Ping.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Quic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Requests.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Security.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.ServicePoint.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.Sockets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.WebClient.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.WebHeaderCollection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.WebProxy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.WebSockets.Client.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.WebSockets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Net.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Numerics.Vectors.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Numerics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ObjectModel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Private.CoreLib.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Private.DataContractSerialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Private.Uri.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Private.Xml.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Private.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.DispatchProxy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.Emit.ILGeneration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.Emit.Lightweight.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.Emit.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.Metadata.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.TypeExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Reflection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Resources.Reader.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Resources.ResourceManager.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Resources.Writer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.CompilerServices.Unsafe.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.CompilerServices.VisualC.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Handles.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.InteropServices.JavaScript.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.InteropServices.RuntimeInformation.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.InteropServices.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Intrinsics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Loader.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Numerics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Formatters.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.Serialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Runtime.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Claims.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.Algorithms.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.Cng.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.Csp.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.Encoding.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.OpenSsl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.ProtectedData.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.X509Certificates.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Cryptography.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Principal.Windows.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.Principal.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.SecureString.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Security.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ServiceModel.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ServiceProcess.ServiceController.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ServiceProcess.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Text.Encoding.CodePages.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Text.Encoding.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Text.Encoding.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Text.Encodings.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Text.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Text.RegularExpressions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Channels.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Overlapped.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Tasks.Dataflow.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Tasks.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Tasks.Parallel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Tasks.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Thread.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.ThreadPool.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.Timer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Threading.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Transactions.Local.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Transactions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.ValueTuple.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Web.HttpUtility.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Windows.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.ReaderWriter.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.Serialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.XDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.XPath.XDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.XPath.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.XmlDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.XmlSerializer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/System.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/WindowsBase.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/clretwrc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/clrgc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/clrjit.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/coreclr.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/createdump.exe
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/e_sqlite3.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/hostfxr.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/hostpolicy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/mscordaccore.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/mscordaccore_amd64_amd64_8.0.2926.32403.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/mscordbi.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/mscorlib.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/mscorrc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/msquic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/Release/net8.0-windows/win-x64/netstandard.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.deps.json
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.exe
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.pdb
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.runtimeconfig.json
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.CSharp.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Data.Sqlite.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.DiaSymReader.Native.amd64.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Binder.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.CommandLine.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.EnvironmentVariables.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.FileExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.UserSecrets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Physical.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.FileSystemGlobbing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.WindowsServices.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Http.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Debug.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventLog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Options.ConfigurationExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Options.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.VisualBasic.Core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.VisualBasic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Win32.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Win32.Registry.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/SQLitePCLRaw.batteries_v2.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/SQLitePCLRaw.core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/SQLitePCLRaw.provider.e_sqlite3.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Extensions.Hosting.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Extensions.Logging.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Sinks.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Sinks.File.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/Serilog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.AppContext.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Buffers.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Collections.Concurrent.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Collections.Immutable.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Collections.NonGeneric.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Collections.Specialized.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Collections.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ComponentModel.Annotations.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ComponentModel.DataAnnotations.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ComponentModel.EventBasedAsync.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ComponentModel.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ComponentModel.TypeConverter.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ComponentModel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Data.Common.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Data.DataSetExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Data.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.Contracts.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.Debug.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.DiagnosticSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.EventLog.Messages.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.EventLog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.FileVersionInfo.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.Process.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.StackTrace.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.TextWriterTraceListener.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.Tools.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.TraceSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.Tracing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Drawing.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Drawing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Dynamic.Runtime.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Formats.Asn1.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Formats.Tar.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Globalization.Calendars.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Globalization.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Globalization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.Compression.Brotli.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.Compression.FileSystem.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.Compression.Native.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.Compression.ZipFile.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.Compression.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.FileSystem.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.FileSystem.DriveInfo.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.FileSystem.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.FileSystem.Watcher.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.FileSystem.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.IsolatedStorage.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.MemoryMappedFiles.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.Pipes.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.Pipes.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.UnmanagedMemoryStream.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.IO.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Linq.Expressions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Linq.Parallel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Linq.Queryable.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Memory.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Http.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Http.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.HttpListener.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Mail.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.NameResolution.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.NetworkInformation.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Ping.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Quic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Requests.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Security.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.ServicePoint.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.Sockets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.WebClient.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.WebHeaderCollection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.WebProxy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.WebSockets.Client.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.WebSockets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Net.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Numerics.Vectors.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Numerics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ObjectModel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Private.CoreLib.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Private.DataContractSerialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Private.Uri.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Private.Xml.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Private.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.DispatchProxy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.Emit.ILGeneration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.Emit.Lightweight.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.Emit.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.Metadata.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.TypeExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Reflection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Resources.Reader.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Resources.ResourceManager.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Resources.Writer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.CompilerServices.Unsafe.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.CompilerServices.VisualC.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Handles.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.InteropServices.JavaScript.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.InteropServices.RuntimeInformation.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.InteropServices.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Intrinsics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Loader.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Numerics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Serialization.Formatters.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Serialization.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Serialization.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Serialization.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.Serialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Runtime.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Claims.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.Algorithms.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.Cng.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.Csp.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.Encoding.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.OpenSsl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.ProtectedData.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.X509Certificates.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Principal.Windows.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Principal.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.SecureString.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Security.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ServiceModel.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ServiceProcess.ServiceController.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ServiceProcess.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Text.Encoding.CodePages.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Text.Encoding.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Text.Encoding.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Text.Encodings.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Text.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Text.RegularExpressions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Channels.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Overlapped.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Tasks.Dataflow.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Tasks.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Tasks.Parallel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Tasks.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Thread.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.ThreadPool.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.Timer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Threading.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Transactions.Local.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Transactions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.ValueTuple.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Web.HttpUtility.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Windows.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.ReaderWriter.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.Serialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.XDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.XPath.XDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.XPath.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.XmlDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.XmlSerializer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/System.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/WindowsBase.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/clretwrc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/clrgc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/clrjit.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/coreclr.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/createdump.exe
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/e_sqlite3.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/hostfxr.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/hostpolicy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/mscordaccore.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/mscordaccore_amd64_amd64_8.0.2926.32403.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/mscordbi.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/mscorlib.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/mscorrc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/msquic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Debug/net8.0-windows/win-x64/netstandard.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.deps.json
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.exe
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.pdb
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.runtimeconfig.json
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.CSharp.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Data.Sqlite.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.DiaSymReader.Native.amd64.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Binder.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.CommandLine.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.EnvironmentVariables.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.FileExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.UserSecrets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Physical.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileSystemGlobbing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.WindowsServices.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Http.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Abstractions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Debug.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventLog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Options.ConfigurationExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Options.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.VisualBasic.Core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.VisualBasic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Win32.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Win32.Registry.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/SQLitePCLRaw.batteries_v2.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/SQLitePCLRaw.core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/SQLitePCLRaw.provider.e_sqlite3.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Serilog.Extensions.Hosting.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Serilog.Extensions.Logging.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Serilog.Sinks.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Serilog.Sinks.File.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/Serilog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.AppContext.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Buffers.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Collections.Concurrent.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Collections.Immutable.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Collections.NonGeneric.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Collections.Specialized.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Collections.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ComponentModel.Annotations.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ComponentModel.DataAnnotations.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ComponentModel.EventBasedAsync.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ComponentModel.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ComponentModel.TypeConverter.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ComponentModel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Configuration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Console.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Core.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Data.Common.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Data.DataSetExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Data.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.Contracts.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.Debug.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.DiagnosticSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.EventLog.Messages.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.EventLog.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.FileVersionInfo.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.Process.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.StackTrace.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.TextWriterTraceListener.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.Tools.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.TraceSource.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.Tracing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Drawing.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Drawing.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Dynamic.Runtime.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Formats.Asn1.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Formats.Tar.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Globalization.Calendars.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Globalization.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Globalization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.Compression.Brotli.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.Compression.FileSystem.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.Compression.Native.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.Compression.ZipFile.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.Compression.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.FileSystem.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.FileSystem.DriveInfo.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.FileSystem.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.FileSystem.Watcher.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.FileSystem.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.IsolatedStorage.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.MemoryMappedFiles.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.Pipes.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.Pipes.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.UnmanagedMemoryStream.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.IO.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Linq.Expressions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Linq.Parallel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Linq.Queryable.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Memory.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Http.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Http.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.HttpListener.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Mail.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.NameResolution.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.NetworkInformation.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Ping.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Quic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Requests.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Security.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.ServicePoint.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.Sockets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.WebClient.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.WebHeaderCollection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.WebProxy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.WebSockets.Client.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.WebSockets.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Net.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Numerics.Vectors.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Numerics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ObjectModel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Private.CoreLib.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Private.DataContractSerialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Private.Uri.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Private.Xml.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Private.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.DispatchProxy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.Emit.ILGeneration.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.Emit.Lightweight.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.Emit.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.Metadata.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.TypeExtensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Reflection.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Resources.Reader.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Resources.ResourceManager.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Resources.Writer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.CompilerServices.Unsafe.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.CompilerServices.VisualC.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Handles.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.InteropServices.JavaScript.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.InteropServices.RuntimeInformation.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.InteropServices.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Intrinsics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Loader.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Numerics.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Formatters.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Serialization.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.Serialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Runtime.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.AccessControl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Claims.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.Algorithms.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.Cng.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.Csp.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.Encoding.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.OpenSsl.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.Primitives.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.ProtectedData.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.X509Certificates.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Principal.Windows.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.Principal.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.SecureString.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Security.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ServiceModel.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ServiceProcess.ServiceController.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ServiceProcess.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Text.Encoding.CodePages.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Text.Encoding.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Text.Encoding.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Text.Encodings.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Text.Json.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Text.RegularExpressions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Channels.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Overlapped.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Tasks.Dataflow.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Tasks.Extensions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Tasks.Parallel.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Tasks.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Thread.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.ThreadPool.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.Timer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Threading.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Transactions.Local.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Transactions.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.ValueTuple.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Web.HttpUtility.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Web.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Windows.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.Linq.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.ReaderWriter.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.Serialization.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.XDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.XPath.XDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.XPath.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.XmlDocument.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.XmlSerializer.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.Xml.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/System.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/WindowsBase.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/clretwrc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/clrgc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/clrjit.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/coreclr.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/createdump.exe
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/e_sqlite3.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/hostfxr.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/hostpolicy.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/mscordaccore.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/mscordaccore_amd64_amd64_8.0.2926.32403.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/mscordbi.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/mscorlib.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/mscorrc.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/msquic.dll
D	gateway/src/DijiPeople.Gateway.Host/bin/x64/Release/net8.0-windows/win-x64/netstandard.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/DijiPeople.Gateway.Host.csproj.nuget.dgspec.json
D	gateway/src/DijiPeople.Gateway.Host/obj/DijiPeople.Gateway.Host.csproj.nuget.g.props
D	gateway/src/DijiPeople.Gateway.Host/obj/DijiPeople.Gateway.Host.csproj.nuget.g.targets
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.AssemblyInfo.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.AssemblyInfoInputs.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.GeneratedMSBuildEditorConfig.editorconfig
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.GlobalUsings.g.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.assets.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.AssemblyReference.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.CoreCompileInputs.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.FileListAbsolute.txt
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.genruntimeconfig.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/PublishOutputs.25bd93728e.txt
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/apphost.exe
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/ref/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/Release/net8.0-windows/win-x64/refint/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/project.assets.json
D	gateway/src/DijiPeople.Gateway.Host/obj/project.nuget.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeop.D7D73DEA.Up2Date
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.AssemblyInfo.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.AssemblyInfoInputs.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.GeneratedMSBuildEditorConfig.editorconfig
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.GlobalUsings.g.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.assets.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.AssemblyReference.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.CoreCompileInputs.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.FileListAbsolute.txt
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.genruntimeconfig.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Host.sourcelink.json
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.pdb
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/apphost.exe
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/ref/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Debug/net8.0-windows/win-x64/refint/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeop.D7D73DEA.Up2Date
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.AssemblyInfo.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.AssemblyInfoInputs.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.GeneratedMSBuildEditorConfig.editorconfig
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.GlobalUsings.g.cs
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.assets.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.AssemblyReference.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.CoreCompileInputs.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.csproj.FileListAbsolute.txt
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.genruntimeconfig.cache
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Host.sourcelink.json
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.pdb
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/apphost.exe
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/ref/DijiPeople.Gateway.dll
D	gateway/src/DijiPeople.Gateway.Host/obj/x64/Release/net8.0-windows/win-x64/refint/DijiPeople.Gateway.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.deps.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.exe
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.pdb
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.deps.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.exe
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.pdb
D	gateway/tests/DijiPeople.Gateway.FakeWorker/bin/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.AssemblyInfo.cs
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.AssemblyInfoInputs.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.GeneratedMSBuildEditorConfig.editorconfig
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.GlobalUsings.g.cs
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.assets.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.csproj.CoreCompileInputs.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.csproj.FileListAbsolute.txt
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.genruntimeconfig.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.pdb
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/DijiPeople.Gateway.FakeWorker.sourcelink.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/apphost.exe
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/ref/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Debug/net8.0-windows/refint/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/DijiPeople.Gateway.FakeWorker.csproj.nuget.dgspec.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/DijiPeople.Gateway.FakeWorker.csproj.nuget.g.props
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/DijiPeople.Gateway.FakeWorker.csproj.nuget.g.targets
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.AssemblyInfo.cs
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.AssemblyInfoInputs.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.GeneratedMSBuildEditorConfig.editorconfig
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.GlobalUsings.g.cs
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.assets.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.csproj.CoreCompileInputs.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.csproj.FileListAbsolute.txt
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.genruntimeconfig.cache
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.pdb
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/DijiPeople.Gateway.FakeWorker.sourcelink.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/apphost.exe
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/ref/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/Release/net8.0-windows/refint/DijiPeople.Gateway.FakeWorker.dll
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/project.assets.json
D	gateway/tests/DijiPeople.Gateway.FakeWorker/obj/project.nuget.cache
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/.msCoverageSourceRootsMapping_DijiPeople.Gateway.Tests
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.FakeWorker.deps.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.FakeWorker.exe
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.FakeWorker.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.deps.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.pdb
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.deps.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.exe
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.pdb
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Data.Sqlite.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Binder.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.CommandLine.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.EnvironmentVariables.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.FileExtensions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Json.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.UserSecrets.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Physical.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.FileSystemGlobbing.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.WindowsServices.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Http.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Configuration.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Console.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Debug.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventLog.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventSource.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Logging.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Options.ConfigurationExtensions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Options.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.Extensions.Primitives.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.TestPlatform.CommunicationUtilities.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.TestPlatform.CoreUtilities.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.TestPlatform.CrossPlatEngine.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.TestPlatform.PlatformAbstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.TestPlatform.Utilities.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.VisualStudio.CodeCoverage.Shim.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.VisualStudio.TestPlatform.Common.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Microsoft.VisualStudio.TestPlatform.ObjectModel.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Newtonsoft.Json.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/SQLitePCLRaw.batteries_v2.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/SQLitePCLRaw.core.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/SQLitePCLRaw.provider.e_sqlite3.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Extensions.Hosting.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Extensions.Logging.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Sinks.Console.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Serilog.Sinks.File.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/Serilog.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.EventLog.Messages.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/System.Diagnostics.EventLog.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/System.Security.Cryptography.ProtectedData.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/System.ServiceProcess.ServiceController.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/cs/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/cs/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/cs/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/cs/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/cs/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/de/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/de/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/de/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/de/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/de/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/e_sqlite3.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/es/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/es/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/es/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/es/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/es/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/fr/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/fr/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/fr/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/fr/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/fr/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/it/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/it/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/it/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/it/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/it/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ja/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ja/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ja/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ja/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ja/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ko/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ko/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ko/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ko/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ko/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pl/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pl/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pl/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pl/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pl/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pt-BR/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pt-BR/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pt-BR/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pt-BR/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/pt-BR/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ru/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ru/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ru/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ru/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/ru/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/testhost.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/testhost.exe
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/tr/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/tr/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/tr/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/tr/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/tr/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/xunit.abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/xunit.assert.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/xunit.core.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/xunit.execution.dotnet.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/xunit.runner.reporters.netcoreapp10.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/xunit.runner.utility.netcoreapp10.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/xunit.runner.visualstudio.testadapter.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hans/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hans/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hans/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hans/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hans/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hant/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hant/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hant/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hant/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Debug/net8.0-windows/win-x64/zh-Hant/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/.msCoverageSourceRootsMapping_DijiPeople.Gateway.Tests
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.FakeWorker.deps.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.FakeWorker.exe
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.FakeWorker.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.deps.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.pdb
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.deps.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.exe
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.pdb
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.runtimeconfig.json
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Data.Sqlite.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Binder.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.CommandLine.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.EnvironmentVariables.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.FileExtensions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.Json.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.UserSecrets.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Configuration.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.DependencyInjection.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Diagnostics.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileProviders.Physical.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.FileSystemGlobbing.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.WindowsServices.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Hosting.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Http.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Configuration.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Console.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.Debug.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventLog.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.EventSource.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Logging.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Options.ConfigurationExtensions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Options.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.Extensions.Primitives.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.TestPlatform.CommunicationUtilities.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.TestPlatform.CoreUtilities.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.TestPlatform.CrossPlatEngine.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.TestPlatform.PlatformAbstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.TestPlatform.Utilities.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.VisualStudio.CodeCoverage.Shim.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.VisualStudio.TestPlatform.Common.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Microsoft.VisualStudio.TestPlatform.ObjectModel.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Newtonsoft.Json.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/SQLitePCLRaw.batteries_v2.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/SQLitePCLRaw.core.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/SQLitePCLRaw.provider.e_sqlite3.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Serilog.Extensions.Hosting.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Serilog.Extensions.Logging.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Serilog.Sinks.Console.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Serilog.Sinks.File.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/Serilog.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.EventLog.Messages.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/System.Diagnostics.EventLog.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/System.Security.Cryptography.ProtectedData.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/System.ServiceProcess.ServiceController.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/cs/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/cs/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/cs/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/cs/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/cs/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/de/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/de/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/de/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/de/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/de/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/e_sqlite3.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/es/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/es/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/es/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/es/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/es/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/fr/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/fr/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/fr/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/fr/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/fr/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/it/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/it/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/it/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/it/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/it/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ja/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ja/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ja/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ja/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ja/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ko/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ko/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ko/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ko/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ko/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pl/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pl/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pl/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pl/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pl/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pt-BR/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pt-BR/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pt-BR/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pt-BR/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/pt-BR/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ru/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ru/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ru/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ru/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/ru/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/testhost.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/testhost.exe
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/tr/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/tr/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/tr/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/tr/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/tr/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/xunit.abstractions.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/xunit.assert.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/xunit.core.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/xunit.execution.dotnet.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/xunit.runner.reporters.netcoreapp10.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/xunit.runner.utility.netcoreapp10.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/xunit.runner.visualstudio.testadapter.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hans/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hans/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hans/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hans/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hans/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hant/Microsoft.TestPlatform.CommunicationUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hant/Microsoft.TestPlatform.CoreUtilities.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hant/Microsoft.TestPlatform.CrossPlatEngine.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hant/Microsoft.VisualStudio.TestPlatform.Common.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/bin/x64/Release/net8.0-windows/win-x64/zh-Hant/Microsoft.VisualStudio.TestPlatform.ObjectModel.resources.dll
D	gateway/tests/DijiPeople.Gateway.Tests/obj/DijiPeople.Gateway.Tests.csproj.nuget.dgspec.json
D	gateway/tests/DijiPeople.Gateway.Tests/obj/DijiPeople.Gateway.Tests.csproj.nuget.g.props
D	gateway/tests/DijiPeople.Gateway.Tests/obj/DijiPeople.Gateway.Tests.csproj.nuget.g.targets
D	gateway/tests/DijiPeople.Gateway.Tests/obj/project.assets.json
D	gateway/tests/DijiPeople.Gateway.Tests/obj/project.nuget.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeop.923A20E6.Up2Date
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.AssemblyInfo.cs
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.AssemblyInfoInputs.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.GeneratedMSBuildEditorConfig.editorconfig
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.GlobalUsings.g.cs
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.assets.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.csproj.AssemblyReference.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.csproj.CoreCompileInputs.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.csproj.FileListAbsolute.txt
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.dll
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.genruntimeconfig.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.pdb
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.sourcelink.json
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/ref/DijiPeople.Gateway.Tests.dll
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Debug/net8.0-windows/win-x64/refint/DijiPeople.Gateway.Tests.dll
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeop.923A20E6.Up2Date
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.AssemblyInfo.cs
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.AssemblyInfoInputs.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.GeneratedMSBuildEditorConfig.editorconfig
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.GlobalUsings.g.cs
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.assets.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.csproj.AssemblyReference.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.csproj.CoreCompileInputs.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.csproj.FileListAbsolute.txt
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.dll
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.genruntimeconfig.cache
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.pdb
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/DijiPeople.Gateway.Tests.sourcelink.json
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/ref/DijiPeople.Gateway.Tests.dll
D	gateway/tests/DijiPeople.Gateway.Tests/obj/x64/Release/net8.0-windows/win-x64/refint/DijiPeople.Gateway.Tests.dll
M	package-lock.json
M	package.json
A	packages/config/email-providers.js
M	packages/config/index.d.ts
M	packages/config/index.js
M	render.yaml
A	scripts/allocate-id.mjs
A	scripts/backlog-review.mjs
A	scripts/check-declared-dependencies.mjs
A	scripts/check-env-registered.mjs
A	scripts/check-prisma-client-fresh.mjs
A	scripts/ci-evidence.mjs
A	scripts/ci-metrics.mjs
A	scripts/db-preflight.mjs
M	scripts/generate-dashboards.mjs
A	scripts/lib/agent-state.mjs
M	scripts/lib/backlog-records.mjs
A	scripts/lib/id-allocator.mjs
A	scripts/lib/obsidian-config.mjs
M	scripts/lib/obsidian-mappings.mjs
A	scripts/lib/qa-records.mjs
A	scripts/lib/session-records.mjs
A	scripts/lib/session-registry.mjs
M	scripts/lib/task-records.mjs
A	scripts/new-qa-scenario.mjs
M	scripts/new-task.mjs
A	scripts/new-test-plan.mjs
A	scripts/qa-select.mjs
M	scripts/rebuild-backlog.mjs
A	scripts/rebuild-qa.mjs
A	scripts/rebuild-sessions.mjs
M	scripts/rebuild-tasks.mjs
M	scripts/repo-health.mjs
M	scripts/retrieve-knowledge.mjs
A	scripts/session.mjs
M	scripts/sync-obsidian.mjs
M	scripts/validate-framework.mjs
A	scripts/verify-branch-policy.mjs
M	services/api/package.json
A	services/api/prisma/migrations/20260818090000_application_release_sha512/migration.sql
A	services/api/prisma/migrations/20260818090000_transactional_outbox/migration.sql
A	services/api/prisma/migrations/20260818100000_legal_documents_and_subprocessors/migration.sql
A	services/api/prisma/migrations/20260818140000_active_employee_seat_engine/migration.sql
A	services/api/prisma/migrations/20260818160000_subscription_orders_and_tax_basis/migration.sql
A	services/api/prisma/migrations/20260818170000_subscription_order_hash_release/migration.sql
A	services/api/prisma/migrations/20260818171000_subscription_order_plan_setnull/migration.sql
A	services/api/prisma/migrations/20260818190000_seat_plan_changes_and_tenant_readiness/migration.sql
A	services/api/prisma/migrations/20260818210000_cancellation_retention_refunds_reconciliation/migration.sql
A	services/api/prisma/migrations/20260818230000_consent_records/migration.sql
M	services/api/prisma/schema.prisma
A	services/api/prisma/seed-legal.ts
M	services/api/src/app.module.ts
A	services/api/src/common/constants/dual-permission-remediation.spec.ts
M	services/api/src/common/constants/permissions.ts
M	services/api/src/common/constants/rbac-matrix.ts
M	services/api/src/common/constants/wiring-invariants.spec.ts
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/modules/agent/agent.controller.ts
M	services/api/src/modules/app-releases/app-release.controller.ts
M	services/api/src/modules/app-releases/app-releases.module.ts
M	services/api/src/modules/app-releases/release-publisher.service.spec.ts
M	services/api/src/modules/app-releases/release-publisher.service.ts
A	services/api/src/modules/app-releases/update-feed.controller.ts
A	services/api/src/modules/app-releases/update-feed.service.spec.ts
A	services/api/src/modules/app-releases/update-feed.service.ts
M	services/api/src/modules/approvals/approval-matrices.controller.ts
M	services/api/src/modules/approvals/approvals.controller.ts
A	services/api/src/modules/approvals/approvals.scope.spec.ts
M	services/api/src/modules/approvals/approvals.service.ts
M	services/api/src/modules/attendance-engine/attendance-engine.controller.ts
M	services/api/src/modules/attendance-integrations/connectors/connectors.controller.ts
M	services/api/src/modules/attendance-integrations/devices/attendance-device.controller.ts
M	services/api/src/modules/attendance-integrations/gateways/gateway-admin.controller.ts
M	services/api/src/modules/attendance-integrations/integrations/attendance-integration.controller.ts
M	services/api/src/modules/attendance-integrations/operations/attendance-operations.controller.ts
M	services/api/src/modules/attendance-integrations/work-sites/work-site-readiness.controller.ts
A	services/api/src/modules/attendance/attendance-controller-authorization.spec.ts
M	services/api/src/modules/attendance/attendance.controller.ts
A	services/api/src/modules/attendance/attendance.correction-authorization.spec.ts
M	services/api/src/modules/attendance/attendance.service.ts
M	services/api/src/modules/audit/audit.controller.ts
M	services/api/src/modules/auth/auth-access.service.ts
M	services/api/src/modules/auth/auth.controller.ts
M	services/api/src/modules/auth/auth.service.spec.ts
M	services/api/src/modules/auth/auth.service.ts
A	services/api/src/modules/auth/direct-permission-privileges.spec.ts
A	services/api/src/modules/auth/direct-permission-privileges.ts
M	services/api/src/modules/benefits/benefits.controller.ts
A	services/api/src/modules/billing/billing-authorization.spec.ts
M	services/api/src/modules/billing/billing.module.ts
M	services/api/src/modules/billing/controllers/billing.controller.ts
A	services/api/src/modules/billing/services/active-employee-count.service.ts
M	services/api/src/modules/billing/services/billing.service.ts
A	services/api/src/modules/billing/services/cancellation.service.ts
M	services/api/src/modules/billing/services/commercial-config.service.ts
A	services/api/src/modules/billing/services/customer-identity.service.ts
A	services/api/src/modules/billing/services/order-activation.service.ts
A	services/api/src/modules/billing/services/payment-confirmed.handler.ts
A	services/api/src/modules/billing/services/plan-change.service.ts
A	services/api/src/modules/billing/services/reconciliation.service.ts
A	services/api/src/modules/billing/services/retention-hold.service.ts
A	services/api/src/modules/billing/services/seat-change.service.ts
A	services/api/src/modules/billing/services/seat-usage.service.ts
M	services/api/src/modules/billing/services/stripe-billing.service.ts
A	services/api/src/modules/billing/services/subscription-order.service.ts
A	services/api/src/modules/billing/services/tax-basis.service.ts
M	services/api/src/modules/billing/services/webhook.service.ts
M	services/api/src/modules/business-trips/business-trips.controller.ts
M	services/api/src/modules/claims/claims.controller.ts
M	services/api/src/modules/compensation/compensation.controller.ts
M	services/api/src/modules/compensation/salary-package-rules.controller.ts
M	services/api/src/modules/contracts/contracts.agreement-immutability.spec.ts
M	services/api/src/modules/customization/customization.controller.ts
M	services/api/src/modules/dashboard/dashboard.controller.ts
M	services/api/src/modules/data-management/README.md
M	services/api/src/modules/data-management/data-management.controller.ts
A	services/api/src/modules/documents/documents-object-authorization.spec.ts
M	services/api/src/modules/documents/documents.controller.ts
M	services/api/src/modules/documents/documents.repository.ts
M	services/api/src/modules/documents/documents.service.ts
M	services/api/src/modules/employee-levels/employee-levels.controller.ts
A	services/api/src/modules/employees/employee-compensation-access.spec.ts
M	services/api/src/modules/employees/employee-profiles.service.ts
M	services/api/src/modules/employees/employees.controller.ts
M	services/api/src/modules/employment-types/employment-types.controller.ts
M	services/api/src/modules/error-logs/error-logs.service.spec.ts
M	services/api/src/modules/error-logs/error-logs.service.ts
M	services/api/src/modules/inbox/inbox.controller.ts
M	services/api/src/modules/leads/acquisition.catalog.ts
M	services/api/src/modules/leads/leads.contracting.spec.ts
M	services/api/src/modules/leads/leads.module.ts
M	services/api/src/modules/leads/leads.referral.spec.ts
M	services/api/src/modules/leads/leads.service.ts
M	services/api/src/modules/leads/leads.status-transition.spec.ts
M	services/api/src/modules/leads/public-lead-acquisition.spec.ts
M	services/api/src/modules/leave/leave-policies.controller.ts
M	services/api/src/modules/leave/leave-requests.controller.ts
M	services/api/src/modules/leave/leave-types.controller.ts
A	services/api/src/modules/legal/consent.service.ts
A	services/api/src/modules/legal/legal.module.ts
A	services/api/src/modules/legal/legal.service.spec.ts
A	services/api/src/modules/legal/legal.service.ts
A	services/api/src/modules/legal/public-legal.controller.ts
M	services/api/src/modules/loans/loans.controller.ts
M	services/api/src/modules/lookups/configuration.controller.ts
M	services/api/src/modules/lookups/lookups.controller.ts
M	services/api/src/modules/navigation/navigation.controller.ts
M	services/api/src/modules/notifications/email/email-provider-factory.service.ts
A	services/api/src/modules/notifications/email/email-provider-support.spec.ts
A	services/api/src/modules/notifications/lifecycle-notification.handler.ts
M	services/api/src/modules/notifications/notifications.controller.ts
M	services/api/src/modules/notifications/notifications.module.ts
A	services/api/src/modules/notifications/platform-lifecycle-notifications.catalog.ts
M	services/api/src/modules/onboarding/onboarding.controller.ts
M	services/api/src/modules/organization/business-units.controller.ts
M	services/api/src/modules/organization/departments.controller.ts
M	services/api/src/modules/organization/designations.controller.ts
M	services/api/src/modules/organization/locations.controller.ts
A	services/api/src/modules/organization/organization-read-scope.spec.ts
A	services/api/src/modules/organization/organization-structure-authorization.spec.ts
A	services/api/src/modules/organization/organization-structure-tenant-scope.spec.ts
M	services/api/src/modules/organization/organization.service.ts
M	services/api/src/modules/organization/organizations.controller.ts
A	services/api/src/modules/outbox/outbox-dispatcher.service.spec.ts
A	services/api/src/modules/outbox/outbox-dispatcher.service.ts
A	services/api/src/modules/outbox/outbox-worker.service.ts
A	services/api/src/modules/outbox/outbox.module.ts
A	services/api/src/modules/outbox/outbox.service.spec.ts
A	services/api/src/modules/outbox/outbox.service.ts
A	services/api/src/modules/outbox/outbox.types.ts
M	services/api/src/modules/partner-experience/dto/partner-experience.dto.ts
M	services/api/src/modules/partner-experience/partner-activation.workflow.spec.ts
M	services/api/src/modules/partner-experience/partner-experience.module.ts
M	services/api/src/modules/partner-experience/partner-experience.service.ts
M	services/api/src/modules/partner-experience/partner-portal-access.spec.ts
A	services/api/src/modules/partners/partners-platform-authorization.spec.ts
M	services/api/src/modules/partners/partners.controller.ts
M	services/api/src/modules/partners/partners.module.ts
M	services/api/src/modules/partners/partners.service.ts
M	services/api/src/modules/pay-components/pay-components.controller.ts
M	services/api/src/modules/payroll/employer-bank-accounts.controller.ts
M	services/api/src/modules/payroll/payroll-gl.controller.ts
M	services/api/src/modules/payroll/payroll-operations.controller.ts
M	services/api/src/modules/payroll/payroll-run.controller.ts
M	services/api/src/modules/payroll/payroll.controller.ts
M	services/api/src/modules/payslips/payslips.controller.ts
A	services/api/src/modules/permissions/permission-bootstrap-custom-role.spec.ts
M	services/api/src/modules/permissions/permission-bootstrap.service.ts
M	services/api/src/modules/permissions/permissions.controller.ts
M	services/api/src/modules/platform-auth/platform-permissions.spec.ts
M	services/api/src/modules/platform-auth/platform-permissions.ts
M	services/api/src/modules/platform-communications/platform-email-settings.service.ts
M	services/api/src/modules/policies/policies.controller.ts
M	services/api/src/modules/projects/customers.controller.ts
M	services/api/src/modules/projects/projects.controller.ts
M	services/api/src/modules/recruitment/applications.controller.ts
M	services/api/src/modules/recruitment/candidates.controller.ts
M	services/api/src/modules/recruitment/job-openings.controller.ts
M	services/api/src/modules/recruitment/recruitment-pipelines.controller.ts
M	services/api/src/modules/reports/reports.controller.ts
M	services/api/src/modules/settings-runtime/settings-runtime.controller.ts
M	services/api/src/modules/sla/sla.controller.ts
M	services/api/src/modules/super-admin/plan-read-path-purity.spec.ts
M	services/api/src/modules/tax-rules/tax-rules.controller.ts
A	services/api/src/modules/tenant-control-plane/provisioning-operations.service.spec.ts
A	services/api/src/modules/tenant-control-plane/provisioning-operations.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-control-plane.controller.ts
M	services/api/src/modules/tenant-control-plane/tenant-control-plane.module.ts
M	services/api/src/modules/tenant-control-plane/tenant-erasure.constants.ts
M	services/api/src/modules/tenant-settings/enterprise-configuration.controller.ts
A	services/api/src/modules/tenant-settings/feature-availability-authorization.spec.ts
A	services/api/src/modules/tenant-settings/settings-context-authorization.spec.ts
M	services/api/src/modules/tenant-settings/settings-context.controller.ts
A	services/api/src/modules/tenant-settings/settings-context.service.ts
M	services/api/src/modules/tenant-settings/tenant-settings.controller.ts
M	services/api/src/modules/tenant-settings/tenant-settings.module.ts
M	services/api/src/modules/tenant-settings/tenant-settings.service.ts
M	services/api/src/modules/tenants/tenants.controller.ts
M	services/api/src/modules/time-payroll/time-payroll.controller.ts
M	services/api/src/modules/timesheets/timesheet-exports.controller.ts
M	services/api/src/modules/timesheets/timesheet-jobs.controller.ts
M	services/api/src/modules/timesheets/timesheet-policies.controller.ts
M	services/api/src/modules/timesheets/timesheets.controller.ts
M	services/api/src/modules/users/users.controller.ts
M	services/api/src/modules/workflows/workflows.controller.ts
M	services/api/test/attendance-integrations-isolation.e2e-spec.ts
A	services/api/test/cancellation-retention.e2e-spec.ts
M	services/api/test/commercial-bootstrap.e2e-spec.ts
A	services/api/test/consent.e2e-spec.ts
M	services/api/test/jest-e2e.json
A	services/api/test/legal-documents.e2e-spec.ts
A	services/api/test/legal-seed.e2e-spec.ts
A	services/api/test/outbox-delivery.e2e-spec.ts
M	services/api/test/platform-workflows.e2e-spec.ts
A	services/api/test/provisioning-queue.e2e-spec.ts
A	services/api/test/seat-plan-change.e2e-spec.ts
A	services/api/test/seat-usage.e2e-spec.ts
A	services/api/test/subscription-order.e2e-spec.ts
M	turbo.json
```

## Conflicts

SESSION-0016 and SESSION-0017 landed ten commits on `develop` while this session
ran. Eight files conflicted, in three distinct kinds.

**Generated-artifact conflicts (six files).** `docs/backlog/index.md`, both
dashboards, `docs/qa/coverage-matrix.md`, `docs/qa/scenarios/index.md` and
`docs/qa/test-plans/index.md`. Neither side *intended* content here: both are
outputs of rebuild scripts, and each side's file simply reflected its own
records.

**Durable-id collision (one file, and the reason for a whole commit).**
`docs/qa/regressions/index.md`. Both sessions appended to the one hand-maintained
register, and both reached for **REG-065** — theirs for the repository-health
primary-worktree fix (BUG-0076), this branch's for the platform authorization
boundary. Each side intended a different regression under the same id.

**Record-set conflict (one file).**
`docs/tasks/remediation/TASK-0005-inventory.json`, conflicting in four hunks
because both sides appended records: theirs BUG-0075/0076 and ITEM-0057–0059,
this branch's BUG-0071–0074.

## Conflict Resolutions

**Generated artifacts — regenerated, neither side taken.** Running
`qa:rebuild`, `backlog:rebuild`, `rebuild-sessions` and `generate-dashboards`
produced files consistent with the merged record set. Choosing either side would
have produced a file that disagreed with the records it summarises and that the
next rebuild would silently correct — a lie with a short half-life, which is
worse than a visible conflict.

**The REG collision — this branch renumbered, and did so before merging.**
Theirs was already integrated into `develop`, so it holds REG-065; this branch
moved to REG-066, 067, 068. Renumbering was done as its own commit *ahead* of
the merge, because resolving an id collision inside a ten-commit rebase means
re-resolving it in every commit that touches the register, and every resolution
is a fresh chance to keep the wrong one. Renames were applied highest-first so a
rename never lands on an id the next rename still needs, and propagated to all
eleven referencing records rather than the register alone.

Choosing the other side would have silently reassigned BUG-0076's regression to
this branch's authorization test — the register would still have validated, and
the wrong test would have been guarding the wrong bug.

**One thing the conflict itself damaged.** The `=======` boundary fell on a
shared trailing line, so develop's REG-065 lost its `| **Active** | yes |` row
in the merged result. Nothing in the diff made that visible — the entry looked
complete. `backlog:rebuild` refused it: *"Status FIXED requires RegressionId
REG-065 to be active."* Restored. Recorded because it is the clearest argument
in this task for a validator that checks relationships rather than syntax.

**The inventory — develop taken wholesale, this branch's rows re-appended
programmatically.** Four JSON hunks reconciled by hand is how a record quietly
disappears from a file nobody reads directly. Taking develop as the base and
re-adding BUG-0071–0074 by id is deterministic and verifiable: 131 records, both
sessions intact, counts recomputed rather than edited.

## QA

| | |
|---|---|
| **QA Report** | Recorded on TASK-0007 as the WP-13 campaign result table, and as scenarios QA-AUTHZ-010, QA-AUTHZ-011, QA-PLATFORM-001, QA-PLATFORM-002, QA-LANDING-007, QA-LANDING-008. Verdict **PASS with a stated gap**: performance was NOT RUN — no harness exists and building one was outside this package. |
| **Bug IDs** | Created and closed: BUG-0071 (CRITICAL), BUG-0072 (HIGH), BUG-0073, BUG-0074. All VERIFIED with live retests. |
| **Backlog Items** | None created. |

## CI

| | |
|---|---|
| **CI Run ID** | `CI required gate` **success** on `b43ee1e`. Then three consecutive cancellations on `b016441`, `9fb3ef0` and `e850c31`. |
| **CI Result** | See below — the first two were self-inflicted, the third was a real defect this task introduced. |

The first two cancellations were mine: pushing a new commit supersedes the
in-flight run, and I did it twice despite having written that down as a lesson.
Ten of eleven required jobs passed on each; only `Browser e2e` was cut short.

**The third was different, and worth the space.** On `e850c31` nothing was
pushed after it, yet `Browser e2e` and `Database e2e` both ran for exactly
thirty minutes and stopped. That is a job timeout, not a supersede, and
`npm run ci:classify -- --run 32295738061` says what it means without
interpretation:

```
CLASS       CANCELLED_MANUAL_OR_TIMEOUT
IS_EVIDENCE NO
MEANING     Cancelled with no superseding run on this ref. NOT evidence.
```

A gate that cannot be satisfied blocks integration, correctly. The cause was
this task's own `e2e/global-setup.ts`: it warmed eight routes sequentially,
each with its own 120-second timeout, so a cold CI runner could spend up to
**sixteen minutes** warming before a single test ran. A warm-up written to stop
the first test absorbing compile latency had become the largest cost in the job.

Fixed two ways, and both are corrections rather than accommodations:

- The warm-up now shares **one 90-second budget** across all routes, checked
  between them and enforced per request, ordered so the compiles that actually
  hurt come first. Measured worst case with every service down: **8 seconds**,
  against up to 960 before.
- `browser-e2e` `timeout-minutes` raised 30 → 45. This is not papering over the
  bug: the suite genuinely grew from 18 tests to 48 in this task and runs at
  `workers: 1` by deliberate choice, so 30 was tight on merit once the warm-up
  was fixed. On `develop` the same job took 6.5 minutes for 18 tests.

**And then CI found a defect I had missed.** With the timeout fixed the job
completed in 25 minutes and *failed* rather than being cancelled — real evidence
at last. E5 and E6 asserted on the provisioning table's column headers and state
cells, and neither test created a run. Against CI's clean database the screen
correctly rendered its empty state, so there was no table: no `th[scope="col"]`,
zero state cells. The screen was right and the tests were borrowing data.

This is the same defect as Flow D's, which I had found and fixed hours earlier
in this same session — and I fixed it in one place without asking whether the
assumption existed elsewhere in code I had written the same day. The seeding now
lives in `e2e/fixtures/provisioning-runs.ts` and both suites use it, which is
where it should have gone the first time.

E3 and E4 passed in CI throughout, because an axe audit and a body-overflow
check are meaningful against an empty queue. That contrast is what localised the
defect to data dependence rather than to the screen.

Re-verified against a deliberately emptied local database — every provisioning
run deleted first, mirroring CI: **53 passed, 4 skipped, 0 failed** across all
six flows.

**On the exact-SHA rule.** It would have been easy to integrate on `b43ee1e`'s
green gate and call the cancellations noise. That verdict describes a commit
that never saw ten commits of other people's work, and it is exactly the
substitution the rule exists to prevent.

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against the merged `b016441`, not against the pre-merge branch:

- `npx jest` (services/api) — **184 suites, 1406 tests, all passing**
- `npx tsc --noEmit -p tsconfig.build.json` — clean
- `npm run validate:framework` — **2770 checks passing**, up from 2596 because
  `develop` brought 761 lines of new validators with it

The browser suites (48 tests across flows C, D, E, F) were verified on the task
branch against a live stack and **not** re-run post-merge: the merge brought no
change to `apps/admin`, `apps/landing` or `e2e/`. That is a judgement, stated so
it can be disagreed with rather than assumed.

## Release / Deployment Impact

None — not deployed. `MAIN_CHANGE_STATUS = UNTOUCHED`.

`ROLLBACK_CLASS: CODE_ONLY` for every change here: no migration, no schema
change, nothing persisted that encodes a decision. Reverting restores the prior
behaviour exactly — and re-opens BUG-0071, so a rollback would be an incident
rather than a tidy-up.

WP-15 remains `BLOCKED_EXTERNAL`: no `RENDER_API_KEY`, no `VERCEL_TOKEN`, and
neither CLI on `PATH`. Established as fact, not assumed.

## Knowledge Capture

Three module notes written under `docs/knowledge/modules/`, for wikilink targets
the bug records pointed at and the vault had no note for:

- `platform-auth.md` — why identity is checked before permission, the six
  permission-name collisions between the tenant and platform catalogs, and why
  the guard keeps no permissive branch including the draft that proposed one.
- `super-admin.md` — why `RolesGuard` is not the platform boundary and never
  was, and the cost the route-enumeration test deliberately imposes.
- `platform-communications.md` — why a cross-tenant service asserts identity
  itself rather than trusting a guard.

`PLAN-019` was created for the Platform Admin surface, which had no plan of its
own — which is how its accessibility went unverified while every domain plan
passed through its screens.

## Obsidian Sync

Ran from the merged tree, which mattered: `develop` brought a rewrite of
`sync-obsidian.mjs` in this same merge, so syncing from the pre-merge branch
would have published through the old script.

`node scripts/sync-obsidian.mjs` — wrote 57 notes, 373 already current, 4
skipped as empty by the empty-note policy. `npm run knowledge:verify` reads the
vault back:

```
OBSIDIAN_SYNC_STATUS        PASS
VAULT_GENERATED_NOTES       430
OBSIDIAN_UNRESOLVED_LINKS   0
OBSIDIAN_ORPHAN_COUNT       0
OBSIDIAN_STALE_GENERATED    0
OBSIDIAN_PARITY_DIFFS       0
```

Zero unresolved wikilinks is the figure worth reading. This session added
records pointing at `[[platform-auth]]`, `[[super-admin]]` and
`[[platform-communications]]`, none of which had notes — the module notes were
written for that reason, and the count proves no link was left dangling.

## Cleanup

The `dijipeople-bugs` worktree and the `agent/provisioning-ops-and-qa` branch
are **retained** until integration into `develop` completes. Removing either
before the merge lands would discard verified work.

One stray artifact was removed from the **primary** checkout: `session.mjs start`
had written
`docs/sessions/SESSION-0015-…md` there as an untracked file, and it recorded the
wrong worktree path. The record now lives tracked on this branch. Left in place
it would have blocked the user's next `git pull` — an untracked file colliding
with an incoming tracked one — so it was deleted rather than preserved.

The primary checkout's remaining dirt is `apps/landing/next-env.d.ts`, which was
already modified before this session began and belongs to the user. Untouched.
