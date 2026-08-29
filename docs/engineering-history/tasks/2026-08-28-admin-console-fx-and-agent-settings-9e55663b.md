# Engineering History — Admin console fx and agent settings

| | |
|---|---|
| **Task Title** | Admin console fx and agent settings |
| **Task Type** | FEATURE (with a MIGRATION and a reversed product decision inside it) |
| **Date** | 2026-08-28 |
| **Architect Plan** | [`docs/plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md`](../../plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md) |
| **Agents Used** | Architect, Database, Backend/API, Frontend, UI/UX, Security, QA, Reviewer, Integrator. **Not used:** Release/DevOps — nothing was deployed; `main` was untouched and the release is the owner's to time. Product & Backlog Steward's work was done by the Architect directly, because every disposition here came from the owner in the same conversation rather than needing triage. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/admin-console-fx-and-agent-settings` (this record was written from the successor branch, which is why the generator read that name) |
| **Base SHA** | `1003a2ac80edabb5ea0c57e4f647deb278d000a5` |
| **Final Task SHA** | `9e55663b39f2599acd3490a2b1c2b0b6db8ea63a` |
| **Target Branch** | `develop` |
| **Merge Commit** | none — integrated by ref-push, so `develop` is the CI-verified SHA itself rather than a merge of it |
| **Final Target SHA** | `9e55663b39f2599acd3490a2b1c2b0b6db8ea63a` |

### Commits

```
3d2931c4 docs(release): BUG-0904 verified in production, and the release recorded
1003a2ac docs(history): the release, and the fix inside it that shipped and did nothing
c2db6311 feat(admin): convert revenue rather than exclude it, and one deletion rule
9e55663b docs(bugs): the migration was applied after all, and what that measured
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            9e55663b [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   9e55663b [agent/backlog-burndown]
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
```

### Files Changed

69 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
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
A	docs/architecture/platform-fx-reporting.md
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0075-the-subscribe-wizard-never-collects-companysize-which-the-ap.md
M	docs/backlog/open.md
M	docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md
M	docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md
M	docs/bugs/BUG-1745-the-executive-dashboard-reports-zero-revenue-because-reporti.md
A	docs/bugs/BUG-1883-app-releases-and-agent-rollout-render-on-a-shell-no-other-ad.md
A	docs/bugs/BUG-1884-the-re-check-payment-action-is-offered-on-every-customer-inc.md
A	docs/engineering-history/tasks/2026-08-28-promote-open-bug-sweep-to-production-3d2931c4.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/knowledge/releases/2026-08-28-open-bug-sweep.md
A	docs/plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-AGENT-008-the-desktop-agent-is-one-settings-screen-on-the-shared-shell.md
M	docs/qa/scenarios/QA-TENANT-050-leads-are-withdrawn-rather-than-bulk-deleted.md
A	docs/qa/scenarios/QA-TENANT-052-the-payment-panel-asks-what-the-payment-is-doing-before-offe.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/PLAN-020-billing.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0067-promote-the-open-bug-sweep-to-production.md
A	docs/sessions/SESSION-0068-admin-console-fx-reporting-desktop-agent-settings-generic-bu.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	packages/config/platform-runtime-schema.generated.json
A	services/api/prisma/migrations/20260828220000_platform_exchange_rate/migration.sql
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
```

## Conflicts

**None.** `develop` had not moved between `1003a2ac` and the push, so the
integration was a fast-forward. Verified before pushing rather than assumed:
`git rev-parse origin/develop` matched the recorded base.

<!-- The generator's guidance, kept for the next task:
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
| **QA Report** | No browser QA run. Production cannot be driven from this environment — the MCP browser is blocked for production hosts — so every claim below rests on automated suites, and the records say so rather than implying a visual pass. |
| **Bug IDs** | Created: BUG-1883, BUG-1884. Advanced: BUG-1745 (converted rather than excluded), BUG-0018 (reversed the same day). |
| **Backlog Items** | ITEM-0075 closed. ITEM-0060 measured — 69 drifted objects, a number it had never carried. |

## CI

| | |
|---|---|
| **CI Run ID** | `33214721131` (and `33210461374` on the preceding commit) |
| **CI Result** | PASS — all fourteen jobs, on the exact SHA that became `develop` |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against the SHA that became `develop`, before the push:

| Command | Result |
|---|---|
| `npm --workspace api run test` | 2016 passed, 245 suites |
| `npm --workspace admin run test` | 379 passed, 42 suites |
| `npm --workspace web run test` | 888 passed, 28 suites |
| `npm run typecheck` | 8 of 8 tasks |
| `npm run validate:framework` | 4231 checks |
| `npm run prisma:validate` | clean |
| `npx eslint` (api, CI form) | 0 errors, 787 warnings against the 789 ratchet |

The migration was applied to a throwaway database created for the purpose and
dropped afterwards: all 211 applied in order, and
`migrate diff --from-config-datasource --to-schema` reports 69 drifted objects
with `PlatformExchangeRate` **not** among them — which is the evidence it matches
its model rather than merely being valid SQL. Those 69 are pre-existing and are
[[ITEM-0060]].

<!-- The commands actually run against the **merged** SHA, and their
results. Tests that passed on the task branch prove the branch, not the
integrated result.

## Release / Deployment Impact

Nothing was deployed. `main` is `UNTOUCHED` and the release is the owner's to
time.

**When it is released, one thing needs saying:** the dashboard converts money
through rates that do not exist yet on production. The first operator to open
Settings → Exchange rates and press *Refresh rates now* creates them. Until
then the Control Hub reports what it can convert and names QAR under "No rate
for" — which is the same guarantee BUG-1745 asked for, not a regression.

Rollback class: additive. Dropping `PlatformExchangeRate` restores the prior
state exactly; nothing references it.

<!-- Whether this reaches an environment, the rollback class,
and the release record if one exists. `None — not deployed.` is a complete
answer.

## Knowledge Capture

[`docs/architecture/platform-fx-reporting.md`](../../architecture/platform-fx-reporting.md)
— new. Why the conversion exists, the two rules that make a converted figure
safe to read, why there is no cron, and why the model is not tenant-owned.

The lesson worth carrying, and it is not about currency: **two lists describing
one decision will diverge.** `remove` and `bulkDelete` were that, and the
divergence reached an operator as a 400 within hours of a change that was
otherwise correct. The fix that mattered was not restoring the missing arm; it
was removing the second list.

<!-- which `docs/knowledge/` files were written or updated, and their
categories. "Nothing durable was learned" is a valid outcome; record it as one.

## Obsidian Sync

Not run in this task — deferred to the successor session, which is working the
backlog and will sync once rather than twice.

<!-- whether `node scripts/sync-obsidian.mjs` ran, and which `Generated/`
folders changed.

## Cleanup

Worktree `dijipeople-admin-fx` **kept** — the successor session
(SESSION-0069, `agent/backlog-burndown`) is working in it. The branch is kept
too: it is merged into `develop` but not into `main`, and
`repo:health` lists unmerged-to-main branches as things never to delete.

The primary checkout was fast-forwarded to `9e55663` so the owner's workspace
reflects what landed. Its only modification is `.mcp.json`, which was already
theirs before this task started and was recorded as the baseline.
