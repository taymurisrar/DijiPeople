# Engineering History — Perf reliability hardening

| | |
|---|---|
| **Task Title** | Perf reliability hardening |
| **Task Type** | PERFORMANCE + AUDIT (measured engineering audit with scoped implementation) |
| **Date** | 2026-11-21 |
| **Architect Plan** | NOT_APPLICABLE — measurement-led session; the plan and its revisions are in `docs/engineering/audits/2026-11-21-reliability-cost-audit/00-REPORT.md` |
| **Agents Used** | Architect only, working inline. No specialist subagent was dispatched, and **no independent Reviewer or QA role ran** — verification was self-run (unit, API e2e, CI). This is a gap against the required-agents rule, not a pass. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/perf-reliability-hardening` |
| **Base SHA** | `53517ab4dacb39c3a68bff48a7a5b98089b3c5d6` |
| **Final Task SHA** | `fbf002c7dcb763314e75a4afe3d41107ba0e21eb` |
| **Target Branch** | `develop` |
| **Merge Commit** | `fbf002c7` (merge of `origin/develop` into the task branch; `develop` then fast-forwarded to it) |
| **Final Target SHA** | `fbf002c7dcb763314e75a4afe3d41107ba0e21eb` (`origin/develop`); `origin/main` unchanged at `53517ab4` |

### Commits

```
ad2d613b fix(customization): delete a custom module with its own metadata, with an impact dialog
33238a05 Merge remote-tracking branch 'origin/main' into agent/module-delete-impact
b7ddb808 perf(api): bound pool connect wait, add readiness probe, correct render.yaml plan; 2026-11-21 reliability/cost audit (SESSION-0135)
f4c13e19 docs(bugs): BUG-4509 custom module delete loop - REG-698, QA-RUNTIME-047
d378dbe8 perf(api): cut per-request auth statements 39->27, index DataJob poll, worker flag; audit second pass (SESSION-0135)
fbf002c7 Merge origin/develop into agent/perf-reliability-hardening
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
D:/My Work/hrm-dijipeople/dijipeople-perf-reliability           fbf002c7 [agent/perf-reliability-hardening]
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

40 file(s) against `origin/main`.

```
M	apps/web/app/(authenticated)/settings/customization/_components/tables-list.tsx
M	docs/backlog/index.md
M	docs/backlog/open.md
A	docs/bugs/BUG-4509-custom-module-cannot-be-deleted-metadata-first-loop-with-las.md
A	docs/bugs/BUG-4518-jwtauthguard-rewrites-a-timesheet-restriction-403-into-a-401.md
A	docs/engineering/audits/2026-11-21-reliability-cost-audit/00-REPORT.md
A	docs/engineering/context-budget-baseline.json
M	docs/environment-variables.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-RUNTIME-047-custom-module-delete-impact-dialog-own-metadata-cascades-cro.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0135-performance-reliability-and-cost-hardening-audit-111-concept.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	render.yaml
A	scripts/check-context-budget.mjs
A	scripts/check-context-budget.test.mjs
A	scripts/vercel-ignore-build.mjs
A	scripts/vercel-ignore-build.test.mjs
A	services/api/prisma/migrations/20261121090000_datajob_poll_index/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/src/common/guards/jwt-auth.guard.ts
A	services/api/src/common/health/readiness.spec.ts
A	services/api/src/common/health/readiness.ts
M	services/api/src/common/middleware/business-unit-access.middleware.ts
A	services/api/src/common/prisma/pool-config.spec.ts
A	services/api/src/common/prisma/pool-config.ts
M	services/api/src/common/prisma/prisma.service.ts
M	services/api/src/main.ts
M	services/api/src/modules/customization/customization.service.ts
A	services/api/src/modules/customization/delete-module.spec.ts
M	services/api/src/modules/data-management/data-job-worker.service.ts
A	services/api/src/modules/data-management/data-job-worker.settings.spec.ts
A	services/api/test/auth-query-budget.e2e-spec.ts
```

## Conflicts

Three conflicts, all in generated files and all introduced by `develop` commit `f4c13e19` (BUG-4509 records): `docs/backlog/index.md`, `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md`, `docs/tasks/remediation/TASK-0005-inventory.json`. Type: generated-index drift (both sides regenerated the same derived files from different record sets). `develop` intended to add BUG-4509 / REG-698 / QA-RUNTIME-047; this branch intended to add BUG-4518 and the audit records.

## Conflict Resolutions

Took `develop`'s side of each file, then re-ran `rebuild-backlog`, `sync-remediation-inventory`, `rebuild-sessions` and `generate-dashboards`. Choosing this branch's side wholesale would have dropped BUG-4509 and its remediation row; choosing `develop`'s side without regenerating would have dropped BUG-4518. The regenerated counts reconcile (open 313 = 312 + BUG-4509; remediation inventory 814 rows) and both records are present.

## QA

| | |
|---|---|
| **QA Report** | NOT_APPLICABLE — no QA run was produced. Evidence: `services/api/test/auth-query-budget.e2e-spec.ts` (6 tests incl. revocation) and the full API e2e suite (60 suites / 631 tests) on the final code. |
| **Bug IDs** | BUG-4518 created (`ArchitectDisposition: PLAN_REQUIRED`); related to open BUG-3164 |
| **Backlog Items** | None created |

## CI

| | |
|---|---|
| **CI Run ID** | 44888398296 (workflow `CI`, headSha `fbf002c7`); earlier green runs 44884729824 (`d378dbe8`) and 44832063938 (`b7ddb808`) |
| **CI Result** | PASS on the exact merged SHA `fbf002c7` |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Before the push, on the merged tree: `validate-framework` PASS (6611 checks). `develop` was then fast-forwarded to the CI-verified SHA `fbf002c7`, so its tip is byte-identical to the commit CI passed. The merge delta from `develop` was docs-only. NOT re-run after the merge: the API e2e and unit suites (last run on the pre-merge code, which differs only by that docs-only delta). No run against deployed environments.

## Release / Deployment Impact

None — not deployed, and `main` untouched. Behaviour that would reach production on the next release: migration `20261121090000_datajob_poll_index` (additive `CREATE INDEX` on `DataJob`; applied by the pre-deploy `release` step; rollback class additive — dropping the index restores the old plan); `DATA_JOB_WORKER_ENABLED` (default on, no behaviour change unless set to `false`); pool connect timeout now bounded at 15 s by default; new `GET /api/health/ready`; per-request auth statements 39 → 27 with no cross-request caching. `render.yaml` now declares `plan: standard` to match the live service. Prisma `relationJoins` was deliberately NOT enabled (decision D7).

## Knowledge Capture

Written: `docs/engineering/audits/2026-11-21-reliability-cost-audit/00-REPORT.md` (corrected 111-concept matrix, measurements, decisions), `docs/engineering/context-budget-baseline.json`, BUG-4518. No `docs/knowledge/` pattern files were written. Durable lessons are saved to the agent's user memory, not the repository: a read-only field can look empty while the effective value sits under `envSpecificDetails`; enabling a Prisma preview feature changes defaults globally; local-only latency excludes network RTT.

## Obsidian Sync

Not run (`sync-obsidian.mjs` needs a local vault config). `generate-dashboards` was run and committed.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-perf-reliability` and branch `agent/perf-reliability-hardening` are RETAINED: the worktree has a real `npm ci` tree (no junctions) and must be removed with `npm run worktree:remove`, never `git worktree remove`. Throwaway database `dijipeople_perf_test` (local only) retained. Session SESSION-0135 finished; schema lease released.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3164]] · [[BUG-4509]] · [[BUG-4518]] · [[PLAN-011]] · [[QA-RUNTIME-047]] · [[SESSION-0135]] · [[TASK-0005]]

<!-- GRAPH:END -->
