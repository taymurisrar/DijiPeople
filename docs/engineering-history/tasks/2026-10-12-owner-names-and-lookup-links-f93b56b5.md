# Engineering History — Owner names and lookup links

| | |
|---|---|
| **Task Title** | Owner names as entered, every lookup links, edit owner details |
| **Task Type** | BUGFIX |
| **Date** | 2026-10-12 |
| **Architect Plan** | NOT_APPLICABLE — no migration or permission change; repair scope and owner-link design decided with the owner on 2026-10-12 |
| **Agents Used** | Architect inline (backend, frontend, QA, integrator, release). No subagents. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/owner-names-and-lookup-links` |
| **Base SHA** | `773a1393` |
| **Final Task SHA** | `9e5c0567` |
| **Target Branch** | `develop`, then `main` (release PR #107) |
| **Merge Commit** | `f93b56b5` (PR #107; develop fast-forwarded to `9e5c0567` first) |
| **Final Target SHA** | `f93b56b5` on `main` |

### Commits

```
9e5c0567 fix: stop inventing "Owner" surnames; every lookup links; edit owner details
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            773a1393 [develop]
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
D:/My Work/hrm-dijipeople/dijipeople-owner-links                f93b56b5 [agent/owner-names-and-lookup-links]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-r2-storage                 2d86d506 [agent/r2-durable-storage]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
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

36 files against `773a1393` (946 insertions, 54 deletions): provisioning name helper and three call sites, the repair module/script/spec, owner-update DTO and audit, admin lookup links, row highlighting, Edit details, tenant header owner slot, and generated records.

## Conflicts

None.

## Conflict Resolutions

None — `develop` had not moved, so integration was a fast-forward.

## QA

| | |
|---|---|
| **QA Report** | QA-PLATFORM-064 — PASS (repair dry-run/apply/idempotent with control kept; browser 5/5; throwaway DB) |
| **Bug IDs** | BUG-4111 (FIXED, REG-679) |
| **Backlog Items** | None |

## CI

| | |
|---|---|
| **CI Run ID** | 38217105568 (push, `9e5c0567`) and 38218208106 (PR #107, same SHA) |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`f93b56b5` merges `9e5c0567` onto a `main` holding only `ed30bda7`, whose tree `9e5c0567` already contains, so the CI verdict covers it. Production read-only after deploy: /api/health commit, /api/public/plans 200, admin login 200.

## Release / Deployment Impact

Deployed to production from `main` `f93b56b5`. No migration. Data repair run on production with owner approval: dry run listed one user ("Anou Owner"), `--apply` repaired it to "Anou" with a USER_PLACEHOLDER_NAME_REPAIRED audit row, and a re-run found nothing. Rollback: revert the merge; the repaired name can be edited back from Access & Security if ever needed.

## Knowledge Capture

Nothing new for docs/knowledge: the rules sit beside the code (`person-name.ts`, `owner-name-repair.ts`, `lookup-links.spec.ts`) and in BUG-4111.

## Obsidian Sync

See the task finalization report.

## Cleanup

Task worktree removed with the junction-safe guard after finalization; throwaway database `dijipeople_owner_test` dropped.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-4111]] · [[QA-PLATFORM-064]]

<!-- GRAPH:END -->
