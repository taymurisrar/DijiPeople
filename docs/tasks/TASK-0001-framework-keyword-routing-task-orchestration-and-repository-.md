---
TASK_ID: TASK-0001
aliases: [TASK-0001]
TITLE: Framework: keyword routing, task orchestration and repository health
TYPE: FRAMEWORK
SIZE: LARGE
STATUS: COMPLETE
PRIORITY: P1
CREATED_AT: 2026-08-16
AFFECTED_MODULES: [.agent, scripts, docs]
AGENTS: [architect, integrator, release-devops, qa, reviewer]
DEPENDENCIES:
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS: COMPLETE
---

# TASK-0001 — Framework: keyword routing, task orchestration and repository health

## Objective

Extend the existing DijiPeople agent framework so that a `DijiPeople Task:`
prompt routes itself by intent, decomposes large work into durable work
packages that continue automatically, and treats repository and deployment
state as owned engineering surface rather than as something a human notices
afterwards. No parallel framework: every change extends the roles, records and
scripts that already exist. The task is finished when
`node scripts/validate-framework.mjs` passes with the new routing, continuation
and recovery behaviour **simulated** rather than merely documented, and the
repository itself is left `MAIN_SYNC_STATUS = SYNCED`.

## Work Packages

Boundaries follow ownership: each package is a coherent slice of the framework
that can be reviewed on its own.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Keyword and intent router | DONE | — | architect | agent/framework-orchestration | ea400cf | NOT_REQUIRED | — | PASS | MERGED |
| WP-02 | Parent task and work-package orchestration | DONE | WP-01 | architect | agent/framework-orchestration | ea400cf | NOT_REQUIRED | — | PASS | MERGED |
| WP-03 | Repository health, main-sync state machine, protected-main recovery | DONE | — | release-devops | agent/framework-orchestration | ea400cf | NOT_REQUIRED | — | PASS | MERGED |
| WP-04 | Role wiring — Architect, Integrator, Release/DevOps, specialists | DONE | WP-01, WP-02, WP-03 | architect | agent/framework-orchestration | ea400cf | NOT_REQUIRED | — | PASS | MERGED |
| WP-05 | Completion contract and framework validation | DONE | WP-02, WP-03, WP-04 | architect | agent/framework-orchestration | ea400cf | NOT_REQUIRED | — | PASS | MERGED |
| WP-06 | Current protected-main incident, history, knowledge and Obsidian | DONE | WP-05 | integrator | agent/framework-orchestration | ea400cf | NOT_REQUIRED | — | PASS | MERGED |

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The protected-main incident described in the request was already recovered by PR #13 before this task began | `gh pr list` shows #13 `sync/main-local-commits` MERGED 2026-08-16; `git rev-list --left-right --count origin/main...main` returns `0 0` | HIGH | The recovery flow would have to run for real rather than be verified against a completed instance |
| A-02 | `enforce_admins: true` means no direct push to `main` succeeds for any actor, including the owner | `gh api repos/taymurisrar/DijiPeople/branches/main/protection` | HIGH | The recovery flow would be optional rather than the only path, and the router's "no keyword weakens protection" rule would be unenforceable |
| A-03 | Extending `validate-framework.mjs` with behavioural simulations is preferable to adding a second validation script | The file already runs behavioural probes against `loadRecords` in a sandbox — the pattern exists | HIGH | Validation would fragment into two scripts with two opinions, which is the defect the framework calls `divergent-duplicate-guard` |
| A-04 | No deployment capability exists to verify a `DEPLOYED_SHA` against | `ITEM-0010` records that the deployed SHA is not exposed; no observability dependency exists in the repository | HIGH | Deployment drift classification would be able to report `IN_SYNC` honestly, which it currently cannot |

## Owner Decisions

None. Every question this task raised was answerable from the repository.

Two matters are reported to the owner as **decisions to make**, not as blocks —
they are recorded in the final report and neither prevented completion:

- whether merged remote `agent/*` branches should be auto-deleted after merge
- whether autonomous staging deployment should be enabled, which
  `docs/deployment/README.md` currently leaves unauthorised

## Repository Health

`PRE_TASK_REPO_HEALTH = PASS` — verified with `node scripts/repo-health.mjs`
before the task worktree was created:

```
MAIN_SYNC_STATUS   SYNCED
LOCAL_TARGET_SHA   6cfac5cee9515d7da1695796c3e819d0e2b83eec
REMOTE_TARGET_SHA  6cfac5cee9515d7da1695796c3e819d0e2b83eec
AHEAD 0 · BEHIND 0 · DIVERGED false
UNFINISHED_GIT_OPS none
```

`POST_TASK_REPO_HEALTH` is recorded in the engineering-history record for this
task once the merge lands.

## History

- 2026-08-16 — created at `6cfac5c`.
- 2026-08-16 — WP-01 through WP-04 complete; router, orchestration and
  repository-health context documents written, scripts added, roles wired.
- 2026-08-16 — WP-05 complete; contract extended by eight fields,
  `validate-framework.mjs` grown 559 → 714 checks and mutation-tested.
- 2026-08-16 — WP-06 complete; protected-main incident verified recovered with
  zero commits lost, engineering history recorded, knowledge retrieval extended
  to parent tasks, Obsidian mapping added.
- 2026-08-16 — merged via PR [#16](https://github.com/taymurisrar/DijiPeople/pull/16)
  on `CI required gate` = success at `ea400cf`; target `c60970e`;
  `MAIN_SYNC_STATUS = SYNCED`; worktree and branch cleaned up.
  `FINAL_STATUS = COMPLETE`.

Full record:
[`docs/engineering-history/tasks/2026-08-16-framework-orchestration-f38a6bf.md`](../engineering-history/tasks/2026-08-16-framework-orchestration-f38a6bf.md).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[ITEM-0010]]

<!-- GRAPH:END -->
