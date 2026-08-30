# Engineering History — Framework orchestration

| | |
|---|---|
| **Task Title** | Framework: keyword routing, task orchestration and repository health |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-16 |
| **Parent Task** | [`TASK-0001`](../../tasks/TASK-0001-framework-keyword-routing-task-orchestration-and-repository-.md) — LARGE, six work packages |
| **Architect Plan** | NOT_APPLICABLE — the request was itself a specification, at ExecPlan granularity. The decomposition it was executed against is TASK-0001's work-package table. |
| **Agents Used** | Architect (routing, sizing, decomposition), Release/DevOps (repository health), Integrator (Git, PR, recovery verification), Reviewer (self-review against the security checklist). **Deliberately not used:** Backend/API, Frontend, UI/UX, Database, Integration — no product code, no schema, no UI surface is touched by this task. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/framework-orchestration` |
| **Base SHA** | `6cfac5cee9515d7da1695796c3e819d0e2b83eec` |
| **Final Task SHA** | `ea400cf3017b979fea70bfb28b83db58ce517ab3` |
| **Target Branch** | `main` |
| **Merge Commit** | `c60970e7353709dcf14474fd2a21dbade9be178d` (PR [#16](https://github.com/taymurisrar/DijiPeople/pull/16)) |
| **Final Target SHA** | `c60970e7353709dcf14474fd2a21dbade9be178d` |

### Commits

```
f38a6bf feat(framework): keyword routing, task orchestration and repository health
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople               6cfac5c [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0  7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-framework     f38a6bf [agent/framework-orchestration]
```

`dijipeople-authz-batch0` belongs to unrelated in-flight authorization work with
unmerged commits. It was **not** touched — see Cleanup.

### Files Changed

28 file(s) against `origin/main`.

```
M	.agent/agents/README.md
M	.agent/agents/architect.md
M	.agent/agents/integrator.md
M	.agent/agents/qa.md
M	.agent/agents/release-devops.md
M	.agent/agents/reviewer.md
M	.agent/context/knowledge-architecture.md
A	.agent/context/repository-health.md
M	.agent/context/task-completion-contract.md
A	.agent/context/task-orchestration.md
A	.agent/context/task-router.md
M	AGENTS.md
M	docs/development/agent-orchestration.md
M	docs/development/final-report-template.md
M	docs/development/git-worktrees.md
A	docs/tasks/README.md
A	docs/tasks/TASK-0001-framework-keyword-routing-task-orchestration-and-repository-.md
A	docs/tasks/active.md
A	docs/tasks/blocked.md
A	docs/tasks/completed.md
A	docs/tasks/index.md
M	package.json
M	scripts/lib/obsidian-mappings.mjs
A	scripts/lib/task-records.mjs
A	scripts/new-task.mjs
A	scripts/rebuild-tasks.mjs
A	scripts/repo-health.mjs
M	scripts/validate-framework.mjs
```

## Protected Branch Recovery — the incident this task was asked to resolve

The request reported that local `main` carried unpushed commits and that a
direct push had been rejected. **Investigation established the incident was
real and had already been recovered**, in a session before this task began. The
recovery was never recorded, which is why it is recorded here: an unrecorded
recovery looks identical to a problem that never happened, and the next agent
to hit `GH006` learns nothing from it.

### What happened

```
Attempt      direct push to main
Result       GH006 — protected branch update failed
             "Changes must be made through a pull request"
             "Required status check 'CI required gate' is expected"
Local main   4 commits ahead of origin/main
```

Reconstructed from `git reflog show main`, which is the only surviving evidence:

```
f66871e main@{2026-08-16}: commit: temp                    ← committed directly on main
af8a42e main@{2026-08-16}: pull ...: Merge made by 'ort'
bcfcd87 main@{2026-08-16}: pull ...: Merge made by 'ort'
e9cd43c main@{2026-08-16}: pull --no-rebase origin main: Merge made by 'ort'
```

A commit was made directly on local `main` — the accident the recovery flow
exists for — and three subsequent `git pull` invocations created merge commits
on top of it rather than fast-forwarding. `main` was then 4 commits ahead of a
branch that does not accept direct pushes.

### Recovery performed

```
Branch       sync/main-local-commits, at the local main commits
PR           #13 "chore: sync local main commits into origin/main"
CI           CI required gate — passed
Merged       2026-08-16T12:33:24Z → merge commit 7686bb0
Local main   7686bb0 main@{2026-08-16}: merge origin/main: Fast-forward
```

### Verification at this commit

Every commit the recovery carried is present on `origin/main`:

```
f66871e  PRESENT on origin/main
af8a42e  PRESENT on origin/main
bcfcd87  PRESENT on origin/main
e9cd43c  PRESENT on origin/main
```

```
git rev-list --left-right --count origin/main...main   →   0  0
git rev-parse main                                     →   6cfac5cee9515d7...
git rev-parse origin/main                              →   6cfac5cee9515d7...
```

```
Final        local main == origin/main == 6cfac5c   ·   0 commits lost
MAIN_SYNC_STATUS = SYNCED
```

**No recovery action was required by this task.** Re-running the flow against an
already-synced repository would have created an empty branch and an empty PR,
which is noise rather than diligence. What this task did instead was verify the
outcome from refs rather than trust the report, codify the flow so the next
occurrence is handled without a human, and record the incident.

### What the framework now does instead

The ad-hoc recovery took a human noticing a failed push. The flow is now:

- `PROTECTED_BRANCH_REQUIRES_PR` is a **recognised, recoverable classification**,
  not a terminal error and not a question for the user
- the recovery preserves commits with `git branch`, never a cherry-pick — a
  cherry-pick produces different SHAs and loses parents, and the simulation in
  `validate-framework.mjs` asserts SHA identity to keep that true
- `scripts/repo-health.mjs` detects `AHEAD` before a task starts, so the next
  occurrence is caught at `PRE_TASK_REPO_HEALTH` rather than at push time
- `MAIN_SYNC_STATUS = SYNCED` and `POST_TASK_REPO_HEALTH = PASS` are completion
  contract fields, so a task cannot report `COMPLETE` while leaving `main` ahead

## Conflicts

None. The branch was cut from `6cfac5c` and `origin/main` did not advance during
the task.

## Conflict Resolutions

None — see above.

One **near**-conflict is worth recording because it would not be visible in the
diff. `AGENTS.md` and `docs/development/agent-orchestration.md` each carry a copy
of the completion-contract field list, and the task added eight fields. Updating
one and not the other would have left two sources of truth disagreeing — the
`divergent-duplicate-guard` pattern applied to the framework's own
documentation. Both were updated, and `validate-framework.mjs` checks the
contract itself for every new field, so the contract cannot silently lose one.

## QA

| | |
|---|---|
| **QA Report** | NOT_REQUIRED — no product code, no runtime behaviour and no API surface changed. Validation for a FRAMEWORK task is `validate-framework.mjs`, which is where this task's evidence lives. |
| **Bug IDs** | None created. One documentation defect was found and fixed in place rather than recorded: `git-worktrees.md` claimed there was no `.github/` directory and therefore nothing validating a branch — written before CI and branch protection existed. Fixed in this task; it needed no durable record because it is closed. |
| **Backlog Items** | None created. Two owner decisions are reported in TASK-0001 rather than filed, because neither is engineering work: remote-branch auto-deletion policy, and whether autonomous staging deployment should be enabled. |

### Validation actually run

| Command | Result |
|---|---|
| `node scripts/validate-framework.mjs` | **PASS** — 714 checks (559 before this task) |
| `node scripts/rebuild-tasks.mjs --check` | **PASS** — records valid, indexes current |
| `node scripts/rebuild-backlog.mjs --check` | **PASS** — 53 records, 0 structural errors |
| `node scripts/generate-dashboards.mjs --check` | **PASS** — dashboards current |
| `node scripts/repo-health.mjs` | **PASS** — `MAIN_SYNC_STATUS = SYNCED` |

### Mutation testing — evidence the new checks are not vacuous

A validation suite that passes after the behaviour is removed is decoration. Each
mutation was applied, the suite run, and the mutation reverted:

| Mutation | Result |
|---|---|
| `readyPackages` dependency gate `.every` → `.some` | **FAILED** — "an independent package stays runnable while another is blocked" |
| Delete the LARGE-requires-decomposition rule | **FAILED** — "a LARGE task with no work packages is rejected" |
| Permit the Architect to ask before continuing | **FAILED** — "architect must not ask permission to continue" |

## CI

| | |
|---|---|
| **CI Run ID** | `31952397460` and `31952395344`, both on `ea400cf` |
| **CI Result** | **PASS** — `CI required gate` = success on `ea400cf`, the exact SHA merged |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against the **merged** SHA `c60970e`, in the primary checkout on `main`:

| Command | Result |
|---|---|
| `node scripts/validate-framework.mjs` | **PASS** — 714 checks |
| `node scripts/rebuild-tasks.mjs --check` | **PASS** — 1 task, indexes current |
| `node scripts/rebuild-backlog.mjs --check` | **PASS** — 53 records, 0 structural errors |
| `node scripts/generate-dashboards.mjs --check` | **PASS** — dashboards current |
| `node scripts/repo-health.mjs` | **PASS** — `MAIN_SYNC_STATUS = SYNCED` |

`npm run build`, `npm run typecheck` and the workspace test suites were **not**
re-run locally post-merge: this task changes no build input, no TypeScript and no
runtime code, and CI ran all of them on `ea400cf` — the exact SHA merged — where
`CI required gate` reported success. Post-merge CI on `c60970e` is run
`31952821558`.

### Terminal invariant

```
MAIN_SYNC_STATUS      = SYNCED
POST_TASK_REPO_HEALTH = PASS

local main   c60970e7353709dcf14474fd2a21dbade9be178d
origin/main  c60970e7353709dcf14474fd2a21dbade9be178d
merge SHA    c60970e7353709dcf14474fd2a21dbade9be178d
ahead 0 · behind 0 · unfinished Git operations: none
```

All three SHAs match. Comparing only local against remote would have passed just
as happily had the merge that landed been somebody else's.

## Release / Deployment Impact

None — not deployed. This task changes agent instructions, repository scripts and
documentation. No deployable component, migration, environment variable or
runtime contract is affected.

`DEPLOYMENT_DRIFT_STATUS` for the API and the three frontends is `UNKNOWN` and
remains so: this repository does not expose a deployed SHA
([`ITEM-0010`](../../backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md)), so
no environment's `DEPLOYED_SHA` can be read from here. Recording `IN_SYNC` would
require evidence that does not exist.

## Knowledge Capture

The durable lessons are the framework itself — they were written directly into
the instruction layer, which is where a future agent reads them, rather than
copied into `docs/knowledge/`:

| Lesson | Landed in |
|---|---|
| A protected-branch rejection is recoverable, not terminal | `.agent/context/repository-health.md`, `integrator.md`, `AGENTS.md` |
| Recovery preserves commits by branching, never cherry-picking | same, plus an executable simulation in `validate-framework.mjs` |
| An orchestrator must not ask permission to continue | `.agent/context/task-orchestration.md`, `architect.md`, both validated |
| A diagnostic that also acts has no check on a wrong diagnosis | `release-devops.md`, `.agent/agents/README.md`, enforced by checks that `repo-health.mjs` never mutates |
| Documentation asserting infrastructure absence rots silently | `docs/development/git-worktrees.md`, with the drift noted inline |

## Obsidian Sync

`docs/tasks` was added to `scripts/lib/obsidian-mappings.mjs` →
`00 - Home/Generated/Tasks`, so parent-task state publishes beside the backlog
and the engineering history. Sync status for this task is recorded in the final
report.

## Cleanup

- `dijipeople-framework` worktree — removed after merge.
- `agent/framework-orchestration` — deleted locally after merge.
- `dijipeople-authz-batch0` worktree and the seven `agent/authz-*` branches —
  **left untouched.** Each carries unmerged commits and one has a worktree
  attached. They are unrelated in-flight work.
- Five merged non-agent local branches (`final-check`, `postmerge-final`,
  `postmerge-validate`, `sync/main-local-commits`,
  `feature/Taimur/employees-enhancement`) — **reported, not deleted.** The
  cleanup rule only proposes `agent/` and `chore/` branches; a human's
  `feature/` branch is not the framework's to remove, and nothing is lost by
  leaving a merged branch in place.
- 21 merged remote `agent/*` branches — reported as candidates. No repository
  policy authorises automatic remote deletion, so none was deleted.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ITEM-0010]] · [[TASK-0001]]

<!-- GRAPH:END -->
