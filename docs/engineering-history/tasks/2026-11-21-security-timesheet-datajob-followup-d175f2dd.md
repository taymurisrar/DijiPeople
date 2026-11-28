# Engineering History — Security timesheet datajob followup

| | |
|---|---|
| **Task Title** | Security timesheet datajob followup |
| **Task Type** | BUGFIX + SECURITY + PERFORMANCE (SESSION-0136, follow-up to SESSION-0135) |
| **Date** | 2026-11-21 |
| **Architect Plan** | NOT_APPLICABLE — design is recorded in the SESSION-0136 record and the audit report follow-up section; the schema change is additive (nullable columns, one enum value, indexes) |
| **Agents Used** | Architect (this session), dp-qa-engineer and an independent Reviewer/Security pass, both with a no-credential scope (neither re-ran the PostgreSQL-backed suites). Not used: Release/DevOps, since nothing was deployed |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/security-timesheet-datajob-followup` |
| **Base SHA** | `53517ab4dacb39c3a68bff48a7a5b98089b3c5d6` |
| **Final Task SHA** | `d175f2dd304d1b8b2a957a186861433e50d9a104` |
| **Target Branch** | `develop` (main untouched) |
| **Merge Commit** | None — fast-forward ref-push, no merge commit |
| **Final Target SHA** | `d175f2dd304d1b8b2a957a186861433e50d9a104` (develop; main stays `53517ab4`) |

### Commits

```
ad2d613b fix(customization): delete a custom module with its own metadata, with an impact dialog
33238a05 Merge remote-tracking branch 'origin/main' into agent/module-delete-impact
b7ddb808 perf(api): bound pool connect wait, add readiness probe, correct render.yaml plan; 2026-11-21 reliability/cost audit (SESSION-0135)
f4c13e19 docs(bugs): BUG-4509 custom module delete loop - REG-698, QA-RUNTIME-047
d378dbe8 perf(api): cut per-request auth statements 39->27, index DataJob poll, worker flag; audit second pass (SESSION-0135)
fbf002c7 Merge origin/develop into agent/perf-reliability-hardening
1df480bf docs(history): close SESSION-0135 - perf/reliability hardening merged to develop (fbf002c7)
98a9b313 fix(api,web): timesheet-restriction 403 (BUG-4518/3164), tenant-scoped lookups usage (BUG-3157), data-job recovery (BUG-4547); query census, visibility-aware polling (SESSION-0136)
771df3fa fix(data-jobs): close independent review conditions; report follow-up (SESSION-0136)
d175f2dd docs(records): regenerate record-graph Related blocks (CI Framework validation)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            f4c13e19 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
C:/Users/hp/AppData/Local/Temp/gov-a                            4135fe2e [scratch/gov-a]
C:/Users/hp/AppData/Local/Temp/gov-a2                           0ad8fccc [scratch/gov-a2]
C:/Users/hp/AppData/Local/Temp/gov-b                            10c40785 [scratch/gov-b]
C:/Users/hp/AppData/Local/Temp/gov-c-merge                      25122d39 [scratch/gov-c]
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
D:/My Work/hrm-dijipeople/dijipeople-eng-governance             cb3f9730 [agent/module-view-correctness]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration                07bfa0a8 [agent/starter-remediation-integration]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-perf-reliability           d175f2dd [agent/security-timesheet-datajob-followup]
D:/My Work/hrm-dijipeople/dijipeople-pk-payments                fbaa225a [agent/bank-receipt-contact]
D:/My Work/hrm-dijipeople/dijipeople-pk-schema-baseline         c4b27345 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-prodcode                   2a473785 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-r2-storage                 2d86d506 [agent/r2-durable-storage]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/dijipeople-release-hardening          ed2919fb [agent/release-hardening]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/dijipeople-security                   8d07871f [agent/security-advisory-remediation]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-smoke-fix                  f6c1bfbd [agent/smoke-tenant-login]
D:/My Work/hrm-dijipeople/dijipeople-starter-fix                0d90e498 [agent/starter-golive-remediation]
D:/My Work/hrm-dijipeople/dijipeople-starter-qa                 3bad62f8 [agent/starter-golive-qa]
D:/My Work/hrm-dijipeople/dijipeople-starter-verify             22a21a14 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-starter-verify5            f47e504c (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-starter-verify6            17d0dcaf (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-starter-verify7            98f9b025 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-starter-verify8            4dd29d3a (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/dp-plans-review                       516b6ede [agent/review-subscription-plans-screen]
D:/My Work/hrm-dijipeople/dp-qa-repro                           7fe24a7b (detached HEAD)
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
D:/My Work/hrm-dijipeople/wt-contract-signing                   214433c1 [agent/contract-activation-documents]
D:/My Work/hrm-dijipeople/wt-growth-qa                          324a826a [agent/growth-closure-records]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

76 file(s) against `origin/main`.

```
M	apps/web/app/(authenticated)/_components/notification-bell.tsx
M	apps/web/app/(authenticated)/_components/notification-popup-provider.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/tables-list.tsx
M	apps/web/lib/api-error.ts
M	apps/web/lib/server-api.spec.ts
A	apps/web/lib/visibility-polling.spec.ts
A	apps/web/lib/visibility-polling.ts
M	docs/backlog/index.md
M	docs/backlog/open.md
M	docs/bugs/BUG-3157-the-lookups-usage-endpoint-discloses-a-cross-tenant-employee.md
M	docs/bugs/BUG-3164-the-timesheet-restriction-allowlist-omits-the-api-prefix-so-.md
A	docs/bugs/BUG-4509-custom-module-cannot-be-deleted-metadata-first-loop-with-las.md
A	docs/bugs/BUG-4518-jwtauthguard-rewrites-a-timesheet-restriction-403-into-a-401.md
A	docs/bugs/BUG-4547-a-data-job-left-processing-by-a-dead-worker-is-never-recover.md
A	docs/engineering-history/tasks/2026-11-21-perf-reliability-hardening-fbf002c7.md
A	docs/engineering/audits/2026-11-21-reliability-cost-audit/00-REPORT.md
A	docs/engineering/context-budget-baseline.json
M	docs/environment-variables.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-AUTH-023-timesheet-restriction-is-a-403-with-the-real-allow-list-neve.md
A	docs/qa/scenarios/QA-RUNTIME-047-custom-module-delete-impact-dialog-own-metadata-cascades-cro.md
A	docs/qa/scenarios/QA-RUNTIME-048-a-stranded-data-job-recovers-without-applying-any-row-twice.md
A	docs/qa/scenarios/QA-TENANT-069-lookups-usage-counts-only-the-caller-s-own-tenant.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-002-authorization.md
M	docs/qa/test-plans/PLAN-003-tenant-isolation.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/index.md
A	docs/questions/QUESTION-3931-should-tenant-administrators-keep-the-ability-to-create-rena.md
M	docs/questions/index.md
M	docs/questions/open.md
A	docs/sessions/SESSION-0135-performance-reliability-and-cost-hardening-audit-111-concept.md
A	docs/sessions/SESSION-0136-security-validation-of-auth-middleware-skip-timesheet-restri.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	render.yaml
A	scripts/check-context-budget.mjs
A	scripts/check-context-budget.test.mjs
M	scripts/validate-framework.mjs
A	scripts/vercel-ignore-build.mjs
A	scripts/vercel-ignore-build.test.mjs
A	services/api/prisma/migrations/20261121090000_datajob_poll_index/migration.sql
A	services/api/prisma/migrations/20261121120000_datajob_lease_and_row_checkpoint/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/common/guards/jwt-auth.guard.ts
A	services/api/src/common/guards/timesheet-restriction-routes.spec.ts
A	services/api/src/common/guards/timesheet-restriction-routes.ts
A	services/api/src/common/health/readiness.spec.ts
A	services/api/src/common/health/readiness.ts
M	services/api/src/common/middleware/business-unit-access.middleware.ts
A	services/api/src/common/prisma/pool-config.spec.ts
A	services/api/src/common/prisma/pool-config.ts
M	services/api/src/common/prisma/prisma.service.ts
M	services/api/src/main.ts
M	services/api/src/modules/customization/customization.service.ts
A	services/api/src/modules/customization/delete-module.spec.ts
A	services/api/src/modules/data-management/data-job-lease.ts
A	services/api/src/modules/data-management/data-job-recovery.service.ts
M	services/api/src/modules/data-management/data-job-worker.service.ts
A	services/api/src/modules/data-management/data-job-worker.settings.spec.ts
M	services/api/src/modules/data-management/data-management.module.ts
M	services/api/src/modules/data-management/import-execution.service.ts
M	services/api/src/modules/lookups/lookups.controller.ts
M	services/api/src/modules/lookups/lookups.service.ts
A	services/api/test/api-query-census.e2e-spec.ts
A	services/api/test/auth-query-budget.e2e-spec.ts
A	services/api/test/data-job-recovery.e2e-spec.ts
A	services/api/test/employee-scope-isolation.e2e-spec.ts
A	services/api/test/lookups-usage-isolation.e2e-spec.ts
A	services/api/test/timesheet-restriction.e2e-spec.ts
```

## Conflicts

None. The push to develop was a fast-forward from `1df480bf`.

## Conflict Resolutions

None — there was no conflict to resolve.

## QA

| | |
|---|---|
| **QA Report** | Independent QA (no-credential scope) signed off with conditions, all since fixed; the PostgreSQL-backed suites were run by the implementer only. Local on Node 24: API e2e 65 suites / 664 tests, web 91 suites / 1369 tests, framework validation 6629 checks |
| **Bug IDs** | Closed: BUG-4518, BUG-3164, BUG-3157, BUG-4547 (REG-699/700/701). Still open: BUG-3156 (QUESTION-3931), BUG-3136 |
| **Backlog Items** | None created; remediation inventory regenerated |

## CI

| | |
|---|---|
| **CI Run ID** | 44910192363 on d175f2dd. An earlier run, 44908523498 on 771df3fa, FAILED on the record-graph check (stale Related blocks), fixed in d175f2dd |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The push was a fast-forward, so the integrated tree is identical to d175f2dd, whose CI run 44910192363 passed on that exact SHA. No separate post-merge run was made.

## Release / Deployment Impact

None — not deployed. Two additive migrations (20261121090000, 20261121120000) run on the next production release. Rollback: the columns, index and enum value are additive and unused by older code, so reverting the application is enough. Unverified: how an old instance reads rows carrying the new IN_PROGRESS value during a rolling deploy.

## Knowledge Capture

The audit report (docs/engineering/audits/2026-11-21-reliability-cost-audit/00-REPORT.md) carries the follow-up section. Two lessons went to private agent memory rather than docs/knowledge: prove a mutation applied, and give subagents no-credential scopes.

## Obsidian Sync

NOT_RUN — no local vault configuration in this worktree.

## Cleanup

Worktree and local branch kept: owner decisions (QUESTION-3931, relationJoins) and the next work packages continue on this branch.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3136]] · [[BUG-3156]] · [[BUG-3157]] · [[BUG-3164]] · [[BUG-4509]] · [[BUG-4518]] · [[BUG-4547]] · [[PLAN-002]] · [[PLAN-003]] · [[PLAN-011]] · [[QA-AUTH-023]] · [[QA-RUNTIME-047]] · [[QA-RUNTIME-048]] · [[QA-TENANT-069]] · [[QUESTION-3931]] · [[SESSION-0135]] · [[SESSION-0136]] · [[TASK-0005]]

<!-- GRAPH:END -->
