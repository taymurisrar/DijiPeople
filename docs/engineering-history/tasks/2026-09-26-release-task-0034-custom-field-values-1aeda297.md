# Engineering History — Release task 0034 custom field values

| | |
|---|---|
| **Task Title** | Release develop to main: TASK-0034 custom field values and package import at scale |
| **Task Type** | RELEASE — SESSION-0114 |
| **Date** | 2026-09-26 |
| **Architect Plan** | NOT_APPLICABLE — a release of work planned under EXECPLAN-0053 |
| **Agents Used** | release/devops, integrator. Not used: implementation specialists (no code changed in the release) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `develop` (PR #87 head) |
| **Base SHA** | `58fc8fad7a9444bc84aca9e9c105b15aa8f3a3a7` |
| **Final Task SHA** | `8846f11cf999e87921615f15008aa0ebb4dccf3f` |
| **Target Branch** | `main` |
| **Merge Commit** | `1aeda297` — PR #87, merge commit |
| **Final Target SHA** | `1aeda297b7557b4a251738c3d413e8d9a2830bc1` (`main`); `develop` fast-forwarded to it |

### Commits

```
1aeda297 Release: custom field values on Employees and package import at scale (#87)
  — merges b69def93..8846f11c (TASK-0034, seven commits)
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
D:/My Work/hrm-dijipeople/dp-0210                               2b50733e [agent/item-0210-sandbox-on]
D:/My Work/hrm-dijipeople/dp-field-values                       1aeda297 [agent/custom-field-values]
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

0 file(s) against `origin/main`.

```
(no differences against the base)
```

## Conflicts

None. `main` (`58fc8fad`) was an ancestor of `develop` (`8846f11c`), so the merge was conflict-free. The merged tree equals `develop`'s: `git diff 8846f11c 1aeda297` is empty.

## Conflict Resolutions

None — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-09-26-custom-field-values-cd777b7.md` (TASK-0034): PASS WITH RISKS, where the risk is the ITEM-0221 scope. No new QA run for the release itself. |
| **Bug IDs** | BUG-3697, now FIXED, reaches production with this release |
| **Backlog Items** | ITEM-0221 (deferred follow-up), unchanged |

## CI

| | |
|---|---|
| **CI Run ID** | 36271639899 (push) on `8846f11c`, the head SHA merged by PR #87 |
| **CI Result** | PASS — `CI required gate` green on the exact merged head, including Database e2e, Browser e2e and Build |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Post-deploy checks against production:

| Check | Result |
|---|---|
| `/api/health` | commit `1aeda297` |
| `/api/public/commercial-config` | 200 |
| `/api/public/legal` | 200 |
| `/api/employees/custom-fields` (unauthenticated) | 401, so the new route exists and is guarded |
| `/api/customization/packages` (unauthenticated) | 401 |
| app, admin and www login/home pages | 200 |

Vercel `diji-people-web`, `diji-people-admin` and `diji-people-landing` are READY on `1aeda297`.

## Release / Deployment Impact

Deployed to production. Render deploy of `1aeda297` went live at 2026-09-26T21:30Z. Its pre-deploy `release` step logged:

- "Applying migration `20260927093217_custom_record_extension`"
- "All migrations have been successfully applied."
- "Config seed completed successfully."

Before the release: the live deploy and the database-backed endpoints were healthy.

Rollback class: DATABASE_ADDITIVE. The migration only creates the empty `CustomRecordExtension` table, so a code revert leaves an unused table. Existing tenants see no change until someone adds a custom field to Employees.

## Knowledge Capture

Nothing durable beyond the records. TASK-0034 captured its knowledge in its own history.

## Obsidian Sync

`knowledge:sync` ran at `8846f11c` and wrote 32 notes. `knowledge:verify` reported 29 problems, none from this task's or this release's records: the pre-existing GRAPH_ORPHAN and DUPLICATE_NODE notes that TASK-0033 also reported.

## Cleanup

Worktree `dp-field-values` is removed with the guard script, and branch `agent/custom-field-values` deleted, once this records commit is integrated. The throwaway database `dijipeople_fv_test` was dropped.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3697]] · [[ITEM-0221]] · [[SESSION-0114]] · [[TASK-0033]] · [[TASK-0034]]

<!-- GRAPH:END -->
