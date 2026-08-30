# Engineering History — Backlog burndown

| | |
|---|---|
| **Task Title** | Backlog burndown |
| **Task Type** | BACKLOG, containing a MIGRATION, a TEST_GAP closure, and three records whose premises had expired |
| **Date** | 2026-08-29 |
| **Architect Plan** | [`EXECPLAN-0025`](../../plans/EXECPLAN-0025-apps-web-browser-e2e-coverage.md) for the browser coverage. The rest was record work and small fixes below the ExecPlan threshold; TASK-0009 WP-09 carried its own plan from 2026-08-20. |
| **Agents Used** | Architect, Database, Backend/API, Frontend, QA, Reviewer, Integrator, Product and Backlog Steward. **Not used:** Release/DevOps — nothing was deployed and `main` was untouched. Security was not routed separately; the one authorization change (deletion now requires module write **and** platform admin) was put to the owner directly and is recorded on BUG-0018. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/backlog-burndown` |
| **Base SHA** | `949f461c2e9367d4b46ec78f4cf2bd9d884e9064` |
| **Final Task SHA** | `9353872e92d05c0d1b79aa4f4d400233020f4e99` |
| **Target Branch** | `develop` |
| **Merge Commit** | none — integrated by ref-push five times, so `develop` is each CI-verified SHA itself rather than a merge of it |
| **Final Target SHA** | `9353872e` |

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
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            9353872e [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   9353872e [agent/backlog-burndown]
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
D:/My Work/hrm-dijipeople/dijipeople-starter-qa                 eb457d9d [agent/starter-plan-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

178 file(s) against `origin/main`.

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
A	docs/bugs/BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i.md
M	docs/development/browser-e2e.md
A	docs/engineering-history/tasks/2026-08-28-admin-console-fx-and-agent-settings-9e55663b.md
A	docs/engineering-history/tasks/2026-08-28-promote-open-bug-sweep-to-production-3d2931c4.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/framework/trust-the-runtime-invariant-over-a-static-scan.md
A	docs/knowledge/releases/2026-08-28-open-bug-sweep.md
A	docs/plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md
A	docs/plans/EXECPLAN-0025-apps-web-browser-e2e-coverage.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-28-regression-guard-sweep-9e55663.md
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

**None across five integrations.** `develop` did not move under this branch at
any point, checked with `git rev-parse origin/develop` before each push rather
than assumed.

<!-- Generator guidance, kept for the next task:
For each conflict: the files, the type from the nine-type
taxonomy in [`.agent/agents/integrator.md`](../../../.agent/agents/integrator.md),
and what each side intended.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

**None** — see above.

<!-- For each conflict above: what was chosen, and **what would
have been lost by choosing the other side**. This is the field a script cannot
fill and the reason this record is prose.

## QA

| | |
|---|---|
| **QA Report** | [`2026-08-28-regression-guard-sweep-9e55663`](../../qa/runs/2026-08-28-regression-guard-sweep-9e55663.md) — PASS WITH RISKS. Plus the browser run recorded on QA-TENANT-053: 17 passed, 5 skipped, 0 failed. |
| **Bug IDs** | Created: BUG-1950, BUG-1951, BUG-1986 — all three found by the new browser coverage. Decided: BUG-0898 and BUG-0903 to ACCEPTED_RISK. Evidence added: BUG-1668, whose DEFERRED disposition is unchanged. Verified: 48 records moved FIXED to VERIFIED. |
| **Backlog Items** | Closed: ITEM-0034, ITEM-0062, ITEM-0079, ITEM-0081, ITEM-0094, ITEM-0099, ITEM-0103. Corrected: ITEM-0001. |

## CI

| | |
|---|---|
| **CI Run ID** | `33226264094` (final), preceded by `33220499778`, `33221518646` and `33225422210` |
| **CI Result** | PASS on every integrated SHA, exact-SHA. The last two included **Browser e2e starting `apps/web`**, which no CI run had ever done. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

| Command | Result |
|---|---|
| `npm --workspace api run test` | 2022 passed |
| `npm --workspace admin run test` | 379 passed |
| `npm --workspace web run test` | 888 passed |
| `npx playwright test flow-h flow-i flow-j` | 17 passed, 5 skipped, 0 failed |
| api e2e, full | 37 suites, 401 tests |
| `npm run typecheck` | 8 of 8 |
| `npm run validate:framework` | 4293 checks |
| `npm run knowledge:verify` | OBSIDIAN_SYNC_STATUS = PASS |
| `npx eslint` (api, CI form) | 0 errors, 787 warnings against the 789 ratchet |

The identity contract migration was applied to a throwaway database: 212
migrations in order, `User.identityId` reporting `is_nullable: NO`, and
`migrate diff` showing no drift attributable to it.

<!-- The commands actually run against the **merged** SHA, and their
results. Tests that passed on the task branch prove the branch, not the
integrated result.

## Release / Deployment Impact

Nothing deployed. `main` is UNTOUCHED.

**One item here is one-way and must not be released casually.** After the
identity contract phase reaches production, the API cannot be rolled back past
the build that writes `identityId`: the old build does not set the column and the
column no longer permits null, so a rollback breaks user creation entirely. It
should ship in a deployment of its own.

The FX work needs one operator action on first release — Settings, Exchange
rates, Refresh rates now. Until then the dashboard reports what it can convert
and names QAR under "No rate for", which is the BUG-1745 guarantee working
rather than a regression.

<!-- Whether this reaches an environment, the rollback class,
and the release record if one exists. `None — not deployed.` is a complete
answer.

## Knowledge Capture

- [`docs/architecture/platform-fx-reporting.md`](../../architecture/platform-fx-reporting.md) — new.
- [`docs/knowledge/framework/trust-the-runtime-invariant-over-a-static-scan.md`](../../knowledge/framework/trust-the-runtime-invariant-over-a-static-scan.md) — new, and it was already being cited by a wikilink nobody had written.
- [`docs/development/browser-e2e.md`](../../development/browser-e2e.md) — the tenant product, and the rate-limit interaction that makes the suite look broken when it is not.

**The lesson worth carrying is about records, not code.** Three separate records
this session had premises that had expired: ITEM-0062 (membership already built),
BUG-0018 (reversed within hours of being decided), ITEM-0001 (title claims
coverage, delivered tooling). Each nearly caused rework, and one of them did —
ITEM-0034 exists only because ITEM-0001's title reads as a claim about coverage.

A record's **title and summary** are what get read, and they age faster than the
sections beneath them. ITEM-0062 carried a full correction six sections down and
was still acted on from the top, by me.

<!-- which `docs/knowledge/` files were written or updated, and their
categories. "Nothing durable was learned" is a valid outcome; record it as one.

## Obsidian Sync

Ran, and **passes for the first time this session**. `knowledge:verify` reports
OBSIDIAN_SYNC_STATUS = PASS: every mapped note exists, carries substance, matches
its source, and every generated wikilink resolves.

It could not before. `docs/plans` was never mapped into the vault (ITEM-0099), so
**every `[[EXECPLAN-nnnn]]` wikilink resolved to nothing** and the graph was
missing its most-referenced node type. One line in `obsidian-mappings.mjs`
published seven plans. Two further dangling links were closed while the vault was
open.

<!-- whether `node scripts/sync-obsidian.mjs` ran, and which `Generated/`
folders changed.

## Cleanup

Worktree `dijipeople-admin-fx` and branch `agent/backlog-burndown` are both
kept: merged into `develop`, not into `main`, and `repo:health` lists
unmerged-to-main branches as things never to delete.

The throwaway database created for the browser run was dropped and both dev
servers stopped. The populated `dijipeople` development database was never
touched. The primary checkout was fast-forwarded to `9353872e`; its only
modification is `.mcp.json`, which was the user's before this task began and was
recorded as the baseline.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0018]] · [[BUG-0898]] · [[BUG-0900]] · [[BUG-0903]] · [[BUG-0904]] · [[BUG-0905]] · [[BUG-1128]] · [[BUG-1203]] · [[BUG-1208]] · [[BUG-1420]] · [[BUG-1421]] · [[BUG-1423]] · [[BUG-1425]] · [[BUG-1494]] · [[BUG-1516]] · [[BUG-1545]] · [[BUG-1546]] · [[BUG-1547]] · [[BUG-1549]] · [[BUG-1550]] · [[BUG-1553]] · [[BUG-1554]] · [[BUG-1555]] · [[BUG-1556]] · [[BUG-1557]] · [[BUG-1558]] · [[BUG-1559]] · [[BUG-1560]] · [[BUG-1561]] · [[BUG-1649]] · [[BUG-1654]] · [[BUG-1655]] · [[BUG-1668]] · [[BUG-1673]] · [[BUG-1742]] · [[BUG-1743]] · [[BUG-1744]] · [[BUG-1745]] · [[BUG-1746]] · [[BUG-1747]] · [[BUG-1748]] · [[BUG-1749]] · [[BUG-1750]] · [[BUG-1751]] · [[BUG-1752]] · [[BUG-1753]] · [[BUG-1754]] · [[BUG-1755]] · [[BUG-1756]] · [[BUG-1757]] · [[BUG-1883]] · [[BUG-1884]] · [[BUG-1950]] · [[BUG-1951]] · [[BUG-1986]] · [[EXECPLAN-0024]] · [[EXECPLAN-0025]] · [[ITEM-0001]] · [[ITEM-0034]] · [[ITEM-0044]] · [[ITEM-0062]] · [[ITEM-0075]] · [[ITEM-0079]] · [[ITEM-0081]] · [[ITEM-0094]] · [[ITEM-0099]] · [[ITEM-0103]] · [[PLAN-002]] · [[PLAN-004]] · [[PLAN-005]] · [[PLAN-006]] · [[PLAN-008]] · [[PLAN-009]] · [[PLAN-010]] · [[PLAN-011]] · [[PLAN-012]] · [[PLAN-019]] · [[PLAN-020]] · [[QA-AGENT-008]] · [[QA-TENANT-050]] · [[QA-TENANT-052]] · [[QA-TENANT-053]] · [[SESSION-0067]] · [[SESSION-0068]] · [[SESSION-0069]] · [[TASK-0005]] · [[TASK-0009]] · [[TASK-0024]]

<!-- GRAPH:END -->
