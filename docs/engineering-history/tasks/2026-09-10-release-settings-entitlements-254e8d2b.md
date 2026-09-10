# Engineering History — Release settings entitlements

| | |
|---|---|
| **Task Title** | Release settings entitlements |
| **Task Type** | RELEASE — promotion to `main`, a production database write, and a live pass |
| **Date** | 2026-09-10 |
| **Architect Plan** | NOT_APPLICABLE — the design decisions were taken in [`EXECPLAN-0031`](../../plans/EXECPLAN-0031-plan-scoped-settings-visibility.md) and ADR-0005 under SESSION-0094. This session promoted that work and fixed the one gap promotion exposed. |
| **Agents Used** | Architect, Backend/API, Release/DevOps, QA, Integrator, Product & Backlog Steward. **Not used:** Database (no schema change, no migration — the production write was rows, not structure), Frontend (no UI change in this session), Security (no permission or tenant-scoping change) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/release-settings-entitlements` |
| **Base SHA** | `890cd96ded0ecbc77870c5841500d67eafa93aaf` |
| **Final Task SHA** | `254e8d2b52faec52345ba07dd6f53272206b0009` |
| **Target Branch** | `main` — a RELEASE task, so this is the one class permitted to touch it |
| **Merge Commit** | `890cd96ded0ecbc77870c5841500d67eafa93aaf` — PR #70, merge commit, CI verdict read on `6f841a15` which is the exact head it promoted |
| **Final Target SHA** | `890cd96d` on `main`. `develop` continued to `254e8d2b` with the records that followed. |

### Commits

```
72d9db1f docs(bugs): BUG-3007 — Reports is the third structure the gate does not reach
254e8d2b docs(backlog): five records from the Reports review, including why it was missed
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/dijipeople-release-entitle            254e8d2b [agent/release-settings-entitlements]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

13 file(s) against `origin/main`.

```
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0128-reports-and-analytics-two-explanatory-cards-nobody-reads-sit.md
A	docs/backlog/items/ITEM-0129-tenants-should-inherit-the-platform-email-provider-by-defaul.md
A	docs/backlog/items/ITEM-0130-review-process-missed-four-defects-on-screens-adjacent-to-th.md
M	docs/backlog/open.md
A	docs/bugs/BUG-3007-reports-and-analytics-offers-surfaces-and-reports-for-capabi.md
A	docs/bugs/BUG-3020-records-behind-these-numbers-shows-raw-guids-and-a-count-tha.md
A	docs/bugs/BUG-3021-workspace-switcher-in-the-avatar-menu-overflows-horizontally.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/known-bug-patterns/gate-scoped-to-one-structure.md
M	docs/tasks/remediation/TASK-0005-inventory.json
```

## Conflicts

None. `develop` did not move during the session, so the PR merged clean.

One post-merge reconciliation was required and is worth recording as a step
rather than a conflict: the PR merge commit put `main` one commit ahead of
`develop`, which `validate-framework.mjs` reports as `DEVELOP_CONTAINS_MAIN`.
`main` was fast-forwarded back into the task branch and pushed to `develop`. A
release that merges by PR always leaves this to do; a ref-push does not.

## Conflict Resolutions

None — there were no conflicts.

## QA

| | |
|---|---|
| **QA Report** | [`QA-SETTINGS-017`](../../qa/scenarios/QA-SETTINGS-017-settings-visibility-follows-the-tenant-s-plan-entitlements.md) — `PASS_WITH_RISKS`. Steps 1-7 passed against production; steps 8-10 were **not run**, because they change a live tenant's subscription on a platform where tenant email is live. |
| **Bug IDs** | Created: `BUG-3007`, `BUG-3020`, `BUG-3021` — all found during the live pass, all on surfaces this task did not change. Promoted to production: the fix for `BUG-2958`. |
| **Backlog Items** | Created: `ITEM-0128` (explanatory cards), `ITEM-0129` (tenant email inheritance, PLAN_REQUIRED), `ITEM-0130` (why the review missed four defects). |

## CI

| | |
|---|---|
| **CI Run ID** | `34372726777` on `6f841a15` authorised the merge to `main`. Later: `34378075411` on `254e8d2b`. |
| **CI Result** | PASS on every SHA pushed in this session. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

| Check | Result |
|---|---|
| `npm --workspace api run test -- plan-capability-backfill` | PASS — 7 tests |
| `npm --workspace api run check-types` | PASS apart from the known stale-client error |
| `npx eslint` (services/api, changed files) | PASS — 0 errors |
| The full CI `Framework validation` job, all fifteen steps | PASS |
| `/api/health` after deploy | `commit: 890cd96ded0ecbc77870c5841500d67eafa93aaf` |

**The deployed commit was verified, not assumed.** A merge to `main` has
previously not produced a deploy on this service, so the deploy was polled to a
terminal `live` status and the health endpoint read back the exact merge commit.

**The production database write was verified twice.** `repair:plan-capabilities`
ran with `--dry-run` first, printing 15 grants and 5 withholdings; then for
real; then a third time, which wrote nothing — proving idempotence against the
real data rather than against a fixture. Each plan's rows were then read back:
Starter 7 capabilities and none of the four new ones, Growth 14, Enterprise and
Enterprise+ 16 each, and the demo tenant resolving to exactly the seven Starter
keys.

## Release / Deployment Impact

**Deployed to production.** `ROLLBACK_CLASS: CODE_ONLY` — no schema change, no
migration, and the only data written was additive `PlanFeature` rows.

Sequence, and the ordering is the point:

1. `repair:plan-capabilities` against the production database **before** the
   merge. A missing `PlanFeature` row resolves to not-included, so deploying
   first would have removed fourteen settings pages from every tenant, Enterprise
   customers included, for the length of the build.
2. PR #70 merged to `main` at 16:02 UTC. Render auto-deploys `main`.
3. Deploy `dep-dago676417fc73fptpeg` reached `live` after roughly six minutes.
4. `/api/health` confirmed `890cd96d`.
5. Live pass on the Starter demo tenant.

**Two facts about this service that the repository does not describe.** It has
**no `preDeployCommand`**, despite `render.yaml` declaring one, so a deploy runs
no seeds and no migrations. And `seed:config` — the obvious way to write plan
features — runs the whole commercial bootstrap, which reconciles `PlanPrice`
against a catalog that disagrees with the live QAR and USD schedules. Using it
would have repriced the product as a side effect of fixing an entitlement. Both
are why a narrow, additive, feature-only repair had to be written first.

Rollback would be: revert the merge on `main` and redeploy. The `PlanFeature`
rows can be left in place — the previous API build does not know those keys, so
they are inert to it.

## Knowledge Capture

[`gate-scoped-to-one-structure`](../../qa/known-bug-patterns/gate-scoped-to-one-structure.md)
gained a section recording that **it recurred within hours of being written**.
The pattern was authored under SESSION-0094 from BUG-2958; the same afternoon the
user opened Reports & Analytics and found BUG-3007, the third instance of the
same shape, in a module whose own comments assert the gate exists.

That is the durable lesson of this session, and it is not a comfortable one:
writing a pattern down did not cause it to be applied. `ITEM-0130` carries the
process changes that might, the first being to open the changed screen and its
neighbours before claiming completion — this session drove a browser only after
merging to production.

## Obsidian Sync

Ran as part of the framework job on every commit. The generated bug, backlog,
QA and dashboard trees changed with the five new records.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-release-entitle` removed through
`scripts/remove-worktree.mjs`, after first removing the three `node_modules`
junctions it carried. That order is not optional: a recursive delete follows a
junction, and the reverse order has previously emptied thousands of tracked files
out of the user's primary checkout.

Browser artifacts from the live pass were moved out of the checkout root to the
session scratchpad; `.playwright-mcp/` is git-ignored and left alone.

The primary checkout ends as it began — three dirty paths, all the user's, none
touched.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-2958]] · [[BUG-3007]] · [[BUG-3020]] · [[BUG-3021]] · [[EXECPLAN-0031]] · [[ITEM-0128]] · [[ITEM-0129]] · [[ITEM-0130]] · [[QA-SETTINGS-017]] · [[SESSION-0094]] · [[TASK-0005]]

<!-- GRAPH:END -->
