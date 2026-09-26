# Engineering History — Custom field values and import scale

| | |
|---|---|
| **Task Title** | Custom field values and import scale |
| **Task Type** | FEATURE (+ BUGFIX: BUG-3697; PERFORMANCE: import at scale) — TASK-0034, SESSION-0113 |
| **Date** | 2026-09-26 |
| **Architect Plan** | `docs/plans/EXECPLAN-0053-custom-field-values-and-package-import-at-scale.md` (reverses D-1 of EXECPLAN-0052 on the owner's "DP: Fix them and continue") |
| **Agents Used** | database, backend-api, frontend, security, qa, reviewer, integrator, knowledge-graph. Not used: integration (no external system), release/devops for this record (a release is recorded separately) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` (equal to `origin/main` at the time) |
| **Task Branch** | `agent/custom-field-values` |
| **Base SHA** | `58fc8fad7a9444bc84aca9e9c105b15aa8f3a3a7` |
| **Final Task SHA** | `cd777b787741682835822efb7f0bbe789ae4c447` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward by ref-push of the CI-verified SHA |
| **Final Target SHA** | `cd777b787741682835822efb7f0bbe789ae4c447` (`develop`); `main` untouched at `58fc8fad` |

### Commits

```
b69def93 perf(customization): package import applies in batches — 7,444 round trips to 43 for ~1,700 components (TASK-0034)
6acf88ba feat(employees): store custom field values on system modules — Employees first (TASK-0034, BUG-3697)
ed67976d feat(employees): custom fields on the employee form (TASK-0034, BUG-3697)
70da5244 docs(records): TASK-0034 plan, BUG-3697 fixed (REG-638, QA-EMPLOYEES-001), ITEM-0221 follow-up
680b132f chore(generated): regenerate indexes, dashboards, data model and screen map for TASK-0034
cd777b78 fix(web): keep server-only code out of the employee form bundle; regenerate runtime schema (TASK-0034)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            58fc8fad [develop]
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
D:/My Work/hrm-dijipeople/dp-field-values                       cd777b78 [agent/custom-field-values]
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

56 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
M	apps/web/app/(authenticated)/employees/[employeeId]/edit/page.tsx
M	apps/web/app/(authenticated)/employees/[employeeId]/page.tsx
A	apps/web/app/(authenticated)/employees/custom-fields.ts
M	apps/web/app/(authenticated)/employees/new/page.tsx
A	apps/web/lib/runtime/custom-modules/custom-field-data-type.ts
M	apps/web/lib/runtime/custom-modules/custom-module-runtime.ts
A	apps/web/lib/runtime/modules/employee-custom-fields.spec.ts
A	apps/web/lib/runtime/modules/employee-custom-fields.ts
M	apps/web/lib/runtime/modules/employee-data.adapter.ts
M	apps/web/lib/runtime/modules/employee-metadata.adapter.ts
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0221-custom-fields-on-employees-lookup-fields-list-view-columns-a.md
M	docs/backlog/open.md
M	docs/bugs/BUG-3697-a-custom-field-added-to-a-system-module-has-nowhere-to-store.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/data-model/domain-map.md
M	docs/knowledge/data-model/entity-tenant.md
A	docs/plans/EXECPLAN-0053-custom-field-values-and-package-import-at-scale.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-EMPLOYEES-001-a-published-custom-field-on-employees-stores-validates-and-s.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-040-employees.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0113-custom-field-values-on-system-modules-large-package-import-p.md
M	docs/sessions/active.md
M	docs/sessions/index.md
A	docs/tasks/TASK-0034-custom-field-values-on-system-modules-package-import-at-scal.md
M	docs/tasks/active.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	packages/config/platform-runtime-schema.generated.json
A	services/api/prisma/migrations/20260927093217_custom_record_extension/migration.sql
M	services/api/prisma/schema.prisma
A	services/api/src/modules/customization/custom-field-values.module.ts
A	services/api/src/modules/customization/custom-field-values.service.ts
A	services/api/src/modules/customization/custom-field-values.spec.ts
A	services/api/src/modules/customization/custom-field-values.ts
M	services/api/src/modules/customization/customization.service.ts
M	services/api/src/modules/customization/package-alm.service.ts
M	services/api/src/modules/data/custom-data.service.ts
M	services/api/src/modules/data/custom-module-runtime.service.ts
M	services/api/src/modules/employees/dto/create-employee.dto.ts
M	services/api/src/modules/employees/dto/update-employee.dto.ts
M	services/api/src/modules/employees/employee-profiles.service.ts
M	services/api/src/modules/employees/employees.controller.ts
M	services/api/src/modules/employees/employees.module.ts
M	services/api/src/modules/employees/employees.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-erasure.constants.ts
A	services/api/test/custom-field-values.e2e-spec.ts
A	services/api/test/customization-package-alm-scale.e2e-spec.ts
M	services/api/test/customization-package-alm.e2e-spec.ts
```

## Conflicts

None. The task branch was rebased onto `origin/develop` (`58fc8fad`) before its first push. That rebase applied cleanly: develop's three new commits touched `seed-config.ts` and release records, and nothing on this branch. `develop` did not move again before the ref-push, so the fast-forward was conflict-free.

## Conflict Resolutions

None — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-09-26-custom-field-values-cd777b7.md` — **PASS WITH RISKS**. The remaining risk is the ITEM-0221 scope. Covers DB-backed e2e, HTTP against a booted API, a scripted-Playwright browser save and reload, and regression proof by disabling the fix. |
| **Bug IDs** | Closed FIXED: BUG-3697 (REG-638, scenario QA-EMPLOYEES-001) |
| **Backlog Items** | Created and deferred: ITEM-0221 (lookup fields, list-view columns, export, other system modules) |

## CI

| | |
|---|---|
| **CI Run ID** | 36269897626 on `cd777b78` |
| **CI Result** | PASS — `CI required gate` green on the exact SHA pushed to `develop`. An earlier run, 36268477840 on `680b132f`, FAILED Build and Runtime schema tests. Both failures came from this branch and were fixed in `cd777b78` (see the commit message). |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`develop` equals `cd777b78`, the SHA the gate passed. Every required job ran against that SHA: Database e2e, Browser e2e, Build and Runtime schema.

Run locally on the same tree before the push:
- API unit tests: 272 pass.
- The three DB e2e suites: 28 pass.
- Web runtime tests: 397 pass.
- `next build` of apps/web, API and web tsc, API lint (0 errors, 787 warnings, within budget), and all 13 framework-job checks.

## Release / Deployment Impact

None from this record. It is integrated into `develop` only; `main` is untouched.

Rollback class: DATABASE_ADDITIVE. The migration `20260927093217_custom_record_extension` only creates a table. The batched import changes no data shapes.

## Knowledge Capture

- EXECPLAN-0053 records the design: a generic extension table, and access decided by the owning module.
- The QA run records the verification method, including the scripted-Playwright browser pass.
- One lesson went to agent memory: a value import in `apps/web/lib` can pull `next/headers` into a client bundle, and only `next build` catches it. A new Prisma model also stales the generated runtime schema.

## Obsidian Sync

`knowledge:sync` and `knowledge:verify` run after this record is committed, as part of the closure.

## Cleanup

- The throwaway database `dijipeople_fv_test` is dropped.
- The API on :4099 and web on :3011 were stopped, and the worktree's copied `services/api/.env` and `apps/web/.env.local` deleted.
- Worktree `dp-field-values` is removed with the guard script, and branch `agent/custom-field-values` deleted, once this closure commit is integrated.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3697]] · [[ITEM-0221]] · [[PLAN-040]] · [[QA-EMPLOYEES-001]] · [[SESSION-0113]] · [[TASK-0005]] · [[TASK-0034]]

<!-- GRAPH:END -->
