# Engineering History — Custom fields every module

| | |
|---|---|
| **Task Title** | Custom fields every module |
| **Task Type** | FEATURE (+ BUGFIX: BUG-3786, BUG-3787; KNOWLEDGE: Obsidian verify) and its RELEASE — TASK-0035, SESSION-0115 |
| **Date** | 2026-09-27 |
| **Architect Plan** | `docs/plans/EXECPLAN-0054-custom-field-values-on-every-system-module.md`; decision ADR-0024 (owner chose the generic hook for all modules) |
| **Agents Used** | backend-api, frontend, security, qa, reviewer, integrator, knowledge-graph, release-devops; read-only explorers for discovery and route mapping. Not used: database (no schema change), integration (no external system) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/custom-fields-followup` |
| **Base SHA** | `be7189f7cdd026a0d83dce1d8cc00660f88caeb7` |
| **Final Task SHA** | `be7189f7cdd026a0d83dce1d8cc00660f88caeb7` |
| **Target Branch** | `main` |
| **Merge Commit** | `4f64e5e7` — PR #90 (develop → main), merge commit; `develop` fast-forwarded to it |
| **Final Target SHA** | `4f64e5e77c8afcb6577ea2d339dbe564abf24469` (`main` and `develop`) |

### Commits

```
(none — the branch has no commits beyond its base)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            d01e9acf [develop]
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
D:/My Work/hrm-dijipeople/dp-cf-followup                        be7189f7 [agent/custom-fields-followup]
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

None. Two things moved during the task, and neither conflicted:

- **Before the first push, the owner released PR #89** (records only: the TASK-0034 release history and Safepay docs), which moved `develop` to `d01e9acf`. The branch was rebased over it cleanly, and the rewritten SHAs were carried into every record that cites them.
- **At release,** `main` (`d01e9acf`) was an ancestor of `develop` (`be7189f7`). The PR #90 merge tree equals `develop`'s: `git diff be7189f7 4f64e5e7` is empty.

## Conflict Resolutions

None — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-09-27-custom-fields-every-module-4e32ea2.md`. Verdict PASS WITH RISKS: twelve bound modules had no seeded rows to drive live, and BUG-3800 is pre-existing. |
| **Bug IDs** | Fixed: BUG-3786 (REG-639, QA-SETTINGS-034) and BUG-3787 (REG-640, QA-SETTINGS-035). Filed: BUG-3800, PLAN_REQUIRED, pre-existing. |
| **Backlog Items** | ITEM-0221 closed DONE |

## CI

| | |
|---|---|
| **CI Run ID** | 36300804101 on `be7189f7`, the head SHA pushed to `develop` and merged by PR #90 |
| **CI Result** | PASS — `CI required gate` green on the exact SHA, including Database e2e, Browser e2e and Build |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`develop` and `main` hold the tree CI passed on `be7189f7`. Production checks after deploy:

| Check | Result |
|---|---|
| `/api/health` | commit `4f64e5e7` |
| `/api/public/commercial-config`, `/api/public/legal` | 200 |
| `/api/custom-fields/departments` (unauthenticated) | 401, so the route exists and is guarded |
| `/api/departments` (unauthenticated) | 401 |
| app, admin and www | 200 |

Vercel `diji-people-web`, `diji-people-admin` and `diji-people-landing` are READY on `4f64e5e7`. `knowledge:sync` then `knowledge:verify` on `be7189f7` gave **PASS** (29 problems before).

## Release / Deployment Impact

Deployed to production by PR #90 (`main` at `4f64e5e7`), under the standing deploy authorization of 2026-08-31.

The Render deploy went live at 2026-09-27T07:03Z. Its pre-deploy step logged "No pending migrations to apply." and "Config seed completed successfully."

**No migration.** The `CustomRecordExtension` table has existed since the TASK-0034 release. Before the release, the live deploy was healthy and the database-backed endpoints returned 200.

Rollback class: CODE_ONLY. Reverting removes the decorators and the interceptor; stored values stay in `CustomRecordExtension`. Existing tenants see no change until they add a custom field to a system table.

## Knowledge Capture

- **ADR-0024** records the design and its rules for agents: bind with the decorator, do not call the value service from a module; bind `create` only where the route answers with the record; close a table that cannot store values.
- **EXECPLAN-0054** records the table classes and the divergences.
- **`custom-fields.bindings.spec.ts`** makes the rule that every customizable table stores its values an enforced check.

## Obsidian Sync

`knowledge:sync` wrote 139 notes at `be7189f7`, and `knowledge:verify` reported PASS.

## Cleanup

- Throwaway database `dijipeople_cf2_test` dropped.
- API :4099 and web :3011 stopped, and the copied `services/api/.env` and `apps/web/.env.local` deleted.
- Worktree `dp-cf-followup` removed with the guard script, and branch `agent/custom-fields-followup` deleted, once this closure commit is integrated.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0024]] · [[BUG-3786]] · [[BUG-3787]] · [[BUG-3800]] · [[ITEM-0221]] · [[QA-SETTINGS-034]] · [[QA-SETTINGS-035]] · [[SESSION-0115]] · [[TASK-0034]] · [[TASK-0035]]

<!-- GRAPH:END -->
