---
TASK_ID: TASK-0004
aliases: [TASK-0004]
TITLE: Autonomous framework v2 — Architect-only orchestration, multi-session safety, develop integration, persistent QA
TYPE: FRAMEWORK
SIZE: PROGRAM
STATUS: BLOCKED
PRIORITY: P1
CREATED_AT: 2026-08-16
AFFECTED_MODULES: [.agent, scripts, docs/sessions, docs/qa, docs/backlog, docs/tasks, .github/workflows, AGENTS.md]
AGENTS: [architect, qa, reviewer, integrator, release-devops]
DEPENDENCIES: none external
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08, WP-09, WP-10]
BLOCKED_PACKAGES: [WP-11: BLOCKED_EXTERNAL — GitHub protection writes refused by this environment's tooling policy; configuration committed and verifiable; tracked as ITEM-0040]
OWNER_DECISIONS: 1
FINAL_STATUS: COMPLETE_EXCEPT_WP-11 — 10 of 11 packages DONE and integrated into develop at c77933f; WP-11 BLOCKED_EXTERNAL (ITEM-0040)
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
| WP-03 | Branch model — develop integration, main as production control | DONE | WP-02 | release-devops | agent/framework-autonomous-v2 | f64ba4e | PASS | — | PASS | — |
| WP-04 | Persistent QA test plans, scenario registry, coverage matrix | DONE | WP-01 | qa | agent/framework-autonomous-v2 | f64ba4e | PASS | BUG-0047 | PASS | — |
| WP-05 | Agent handoff contract and required-agent completion matrix | DONE | WP-02 | architect | agent/framework-autonomous-v2 | f64ba4e | PASS | — | PASS | — |
| WP-06 | Architect-only operating model and DP: keyword router | DONE | WP-03, WP-05 | architect | agent/framework-autonomous-v2 | f64ba4e | PASS | — | PASS | — |
| WP-07 | Continuous backlog management — aging and revalidation | DONE | WP-01 | architect | agent/framework-autonomous-v2 | f64ba4e | PASS | ITEM-0038 | PASS | — |
| WP-08 | Bidirectional Obsidian and the Engineering Control Center | DONE | WP-04, WP-07 | architect | agent/framework-autonomous-v2 | f64ba4e | PASS_WITH_RISKS | — | PASS | — |
| WP-09 | Framework validation — behavioural simulations | DONE | WP-06, WP-08 | qa | agent/framework-autonomous-v2 | f64ba4e | PASS | — | PASS | — |
| WP-10 | Operating-model documentation and Git/CI cost analysis | DONE | WP-09 | architect | agent/framework-autonomous-v2 | f64ba4e | PASS | — | PASS | — |
| WP-11 | GitHub develop branch configuration | BLOCKED | WP-03 | release-devops | agent/framework-autonomous-v2 | f64ba4e | — | ITEM-0040 | — | — |

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

**One.** [[ITEM-0041]] — the repository ruleset **No push** declares a
one-approving-review rule and its ref condition matches no branch, so it enforces
nothing. Deleting it, repairing it, or accepting it as documentation-only are all
defensible; each has a different consequence for who may merge what, and that is
a repository-owner call rather than an engineering one. Repairing it would block
every merge into `main` on a single-maintainer repository, since GitHub forbids
self-approval.

The develop-branch baseline question resolved itself and is **not** an owner
decision: `origin/develop` had zero unique commits and was a strict ancestor of
`main`, so fast-forwarding it is lossless and establishable by reading the
repository. That is an assumption to verify, not a question to ask.

## Repository Health

PRE_TASK_REPO_HEALTH and POST_TASK_REPO_HEALTH, with MAIN_SYNC_STATUS at each.
See `node scripts/repo-health.mjs`.

- PRE_TASK: `PASS` — `MAIN_SYNC_STATUS = SYNCED` at `714632d`, no unfinished Git
  operations, worktree cut from `origin/main`.
- POST_TASK: `PASS` — `MAIN_CHANGE_STATUS = UNTOUCHED` against baseline
  `714632d`; `DEVELOP_SYNC_STATUS` verified by reading `origin/develop`; no
  unfinished Git operation; `SESSION-0001` released every lease and left the
  merge queue.

`main` advanced twice during the task (`714632d → c179ea3 → b90f33e`) from a
different session. That is `MAIN_SYNC_STATUS` moving, not this task changing
production — which is precisely why the two fields are separate.

## History

- 2026-08-16 — created at `714632d`.
- 2026-08-16 — WP-01 and WP-02 done: the id allocator and the session/lease/merge
  -queue substrate. `simulation 4b` caught a stale per-process cache in the
  allocator before it shipped.
- 2026-08-16 — WP-04 in progress surfaced `BUG-0047`: writing `AUTOMATED`
  scenarios required real test paths, five of the regression register's did not
  resolve, and following that back showed seven bug records closed against fixes
  the integration branch does not have. Two are CRITICAL and live.
- 2026-08-16 — `origin/main` advanced twice mid-task from a concurrent session.
  Merged, four TYPE 7 generated-file conflicts resolved by regeneration, and four
  test plans corrected: the merge brought Playwright, falsifying their claim that
  no browser automation existed.
- 2026-08-16 — WP-11 blocked: GitHub protection writes refused by this
  environment's tooling policy. Configuration committed, verifier written,
  `ITEM-0040` raised. Every other package completed; one blocked package does not
  stop the task.
