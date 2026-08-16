---
TASK_ID: TASK-0004
aliases: [TASK-0004]
TITLE: Autonomous framework v2 — Architect-only orchestration, multi-session safety, develop integration, persistent QA
TYPE: FRAMEWORK
SIZE: PROGRAM
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-16
AFFECTED_MODULES: [.agent, scripts, docs/sessions, docs/qa, docs/backlog, docs/tasks, .github/workflows, AGENTS.md]
AGENTS: [architect, qa, reviewer, integrator, release-devops]
DEPENDENCIES: none external
CURRENT_PACKAGE: WP-03
COMPLETED_PACKAGES: [WP-01, WP-02]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0004 — Autonomous framework v2

## Objective

Extend the existing DijiPeople engineering framework — never replace it — so that
a user talks only to the Architect, several Architect chats can run at once
without corrupting shared state, ordinary work integrates into `develop` while
`main` stays a production deployment control, QA reuses durable test plans and
scenarios instead of rediscovering testing every task, and the Obsidian
relationship runs in both directions. It is finished when
`node scripts/validate-framework.mjs` proves each of those behaviours by
simulation rather than by asserting that a document mentions them.

## Work Packages

Boundaries follow ownership and dependency — schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment. Never "files 1-10".
A good package can be reviewed on its own and has one owning specialist.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Atomic id allocation across sessions and branches | DONE | — | integrator | agent/framework-autonomous-v2 | — | PASS | — | — | — |
| WP-02 | Session registry, write leases, develop merge queue | DONE | WP-01 | integrator | agent/framework-autonomous-v2 | — | PASS | — | — | — |
| WP-03 | Branch model — develop integration, main as production control | IN_PROGRESS | WP-02 | release-devops | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-04 | Persistent QA test plans, scenario registry, coverage matrix | NOT_STARTED | WP-01 | qa | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-05 | Agent handoff contract and required-agent completion matrix | NOT_STARTED | WP-02 | architect | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-06 | Architect-only operating model and DP: keyword router | NOT_STARTED | WP-03, WP-05 | architect | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-07 | Continuous backlog management — aging and revalidation | NOT_STARTED | WP-01 | architect | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-08 | Bidirectional Obsidian and the Engineering Control Center | NOT_STARTED | WP-04, WP-07 | architect | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-09 | Framework validation — behavioural simulations | NOT_STARTED | WP-06, WP-08 | qa | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-10 | Operating-model documentation and Git/CI cost analysis | NOT_STARTED | WP-09 | architect | agent/framework-autonomous-v2 | — | — | — | — | — |
| WP-11 | GitHub develop branch configuration | NOT_STARTED | WP-03 | release-devops | agent/framework-autonomous-v2 | — | — | — | — | — |

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | Every worktree of this repository shares one Git directory, so live coordination state placed there is visible across sessions without a commit | `git rev-parse --git-common-dir` returns the same path from all three existing worktrees | HIGH | The lease and id systems would coordinate nothing; verified before WP-01 depended on it |
| A-02 | `develop` exists on origin but is a stale ancestor of `main`, not a live integration branch | `git rev-list --left-right --count main...develop` = `197 0`; last commit 2026-05-08 | HIGH | Adopting it unchanged would resurrect a three-month-old tree |
| A-03 | CI already runs on pushes to every branch and on PRs to `develop` | `.github/workflows/ci.yml` lines 22-25 | HIGH | develop integration would have no automated validation |
| A-04 | The repository's only ruleset does not actually match any branch, so `main` is protected solely by classic branch protection | ruleset 15523234 `include` is the literal string `refs/heads/"main", "develop"` | HIGH | Changing develop protection could unexpectedly alter main's rules |
| A-05 | No Obsidian vault is configured in this checkout, so outbound sync cannot be executed here | `.obsidian-sync.local.json` absent | HIGH | Obsidian work would be validated only by simulation — which is what happened, and is stated as such |

## Owner Decisions

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

See the record created for the develop-branch baseline question — the only item
in this task that engineering cannot settle on its own.

## Repository Health

PRE_TASK_REPO_HEALTH and POST_TASK_REPO_HEALTH, with MAIN_SYNC_STATUS at each.
See `node scripts/repo-health.mjs`.

- PRE_TASK: `PASS` — `MAIN_SYNC_STATUS = SYNCED` at `714632d`, no unfinished Git
  operations, worktree cut from `origin/main`.

## History

- 2026-08-16 — created at `714632d`.
