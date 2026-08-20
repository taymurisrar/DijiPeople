---
TASK_ID: TASK-0012
aliases: [TASK-0012]
TITLE: Final agent operating system upgrade
TYPE: FRAMEWORK
SIZE: PROGRAM
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-21
AFFECTED_MODULES: [framework]
AGENTS: [Architect, Product & Backlog Steward, Knowledge & Graph, Backend/API, Frontend, UI/UX, Database, Security, Integration, QA, Reviewer, Integrator, Release/DevOps]
DEPENDENCIES: origin/develop 4226e53; SESSION-0026; no schema lease required
CURRENT_PACKAGE: WP-04
NEXT_READY_WORK_PACKAGE: WP-04
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-05, WP-07, WP-09, WP-10]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0012 — Final agent operating system upgrade

## Objective

Turn DijiPeople's collection of specialist agents into a persistent,
self-correcting, context-efficient engineering operating system: permanent role
ownership including two new roles, an escalation protocol that lets any
specialist raise a genuine question, work-package state durable enough that a
new session resumes without rediscovery, evidence that is reused when valid and
invalidated when not, test resources that are owned and cleaned, and a knowledge
graph verified semantically rather than by filename similarity. A reader knows
it is finished when every work package below is `DONE`, the behavioural
simulations in `scripts/validate-framework.mjs` cover the twenty-five scenarios
of the brief, and `develop` holds the result behind a green exact-SHA gate with
`main` untouched.

The program exists to end a specific failure mode: a framework prompt produces a
partial improvement, the partial improvement reveals another hole, and the user
writes another prompt. Every mechanism below is chosen because it removes a
reason for that next prompt.

CONTEXT_FILES_REQUIRED:
  - `AGENTS.md`
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/agent-handoffs.md`
  - `.agent/context/task-orchestration.md`
  - `.agent/context/knowledge-architecture.md`
  - `.agent/context/multi-session.md`
  - `scripts/validate-framework.mjs`
  - `scripts/lib/task-records.mjs`
  - `scripts/lib/obsidian-mappings.mjs`

SPECIALIST_AGENTS_REQUIRED:
  - Architect — decomposition, orchestration, question protocol, architecture stewardship.
  - Product & Backlog Steward — created by this program; owns backlog health from WP-03.
  - Knowledge & Graph — created by this program; owns the Obsidian contract from WP-04.
  - QA — evidence hierarchy, test-resource lifecycle, consolidated campaign.
  - Reviewer — evidence-backed acceptance of every package.
  - Integrator — `develop` integration and semantic conflict check.
  - Release/DevOps — exact-SHA CI verdict and repository health.

DELIBERATELY_NOT_USED:
  - Backend/API, Frontend, UI/UX, Database, Security and Integration write no
    product code in this program. Their role files change in WP-08; their
    implementation surface does not.

TARGET_BRANCH: develop
TARGET_ENVIRONMENT: LOCAL
DEPLOYMENT_REQUIRED: no — framework change, no runtime surface
MERGE_STRATEGY: ref-push to develop at the CI-verified SHA
INTEGRATOR_REQUIRED: yes
RELEASE_DEVOPS_REQUIRED: yes

## Work Packages

Boundaries follow ownership and dependency. Each package is reviewable alone and
leaves the framework in a coherent state, so a session that ends between two
packages loses nothing but its scrollback.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Framework reconciliation and gap register | DONE | — | Architect | agent/agent-operating-system | — | — | — | — | — |
| WP-02 | Question escalation protocol and decision memory | DONE | WP-01 | Architect | agent/agent-operating-system | — | — | — | — | — |
| WP-03 | Product and Backlog Steward role and backlog ownership | DONE | WP-01 | Product & Backlog Steward | agent/agent-operating-system | — | — | — | — | — |
| WP-04 | Knowledge and Graph role and the Obsidian node contract | IN_PROGRESS | WP-01 | Knowledge & Graph | agent/agent-operating-system | — | — | — | — | — |
| WP-05 | Large-task persistence, work-package files and context budget | DONE | WP-01 | Architect | agent/agent-operating-system | — | — | — | — | — |
| WP-06 | Evidence cache and invalidation | NOT_STARTED | WP-05 | Release/DevOps | agent/agent-operating-system | — | — | — | — | — |
| WP-07 | Test resource lifecycle and cleanup registry | DONE | WP-01 | QA | agent/agent-operating-system | — | — | — | — | — |
| WP-08 | Agent role enhancements across the permanent set | NOT_STARTED | WP-02, WP-03, WP-04, WP-05 | Architect | agent/agent-operating-system | — | — | — | — | — |
| WP-09 | Failure adaptation, failure budget and research mode | DONE | WP-01 | Architect | agent/agent-operating-system | — | — | — | — | — |
| WP-10 | Agent health, architecture debt and improvement budget | DONE | WP-03 | Product & Backlog Steward | agent/agent-operating-system | — | — | — | — | — |
| WP-11 | Engineering Control Center expansion | NOT_STARTED | WP-03, WP-04 | Product & Backlog Steward | agent/agent-operating-system | — | — | — | — | — |
| WP-12 | Behavioural simulations and mutation tests | NOT_STARTED | WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-09, WP-10 | QA | agent/agent-operating-system | — | — | — | — | — |
| WP-13 | Semantic record validation, QA evidence hierarchy, id allocation | NOT_STARTED | WP-03, WP-04, WP-07 | QA | agent/agent-operating-system | — | — | — | — | — |
| WP-14 | Reviewer hardening and the completion contract | NOT_STARTED | WP-08, WP-12, WP-13 | Reviewer | agent/agent-operating-system | — | — | — | — | — |
| WP-15 | Exact-SHA CI and develop integration | NOT_STARTED | WP-14 | Integrator | agent/agent-operating-system | — | — | — | — | — |
| WP-16 | Obsidian projection, verification and cleanup | NOT_STARTED | WP-04, WP-15 | Knowledge & Graph | agent/agent-operating-system | — | — | — | — | — |

Per-package state — goal, context manifest, assumptions, evidence, handoff —
lives in `docs/tasks/TASK-0012-final-agent-operating-system-upgrade/work-packages/`.
The table above is the index; those files are the state a resuming session
loads. `node scripts/check-work-packages.mjs` keeps the two from drifting, and
recomputes `NEXT_READY_WORK_PACKAGE` from the dependency graph rather than
trusting the frontmatter value.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The existing single-file parent task record is the canonical task system and must be extended, not replaced | `scripts/lib/task-records.mjs` and `rebuild-tasks.mjs --check` parse it; TASK-0001..0011 all use it | HIGH | A competing task system, which the brief explicitly forbids |
| A-02 | `recordFilesIn` is non-recursive, so a work-package subdirectory under `docs/tasks/` is not parsed as a task record | `scripts/lib/backlog-records.mjs:313` uses `readdirSync` without recursion | HIGH | Every WP file would fail task-record validation |
| A-03 | Repository framework scripts have no `node_modules` dependency, so a fresh worktree runs the whole toolchain | A grep for non-relative, non-`node:` imports across `scripts/**` returns nothing | HIGH | The program could not run in an isolated worktree |
| A-04 | `REG` ids already have an allocator entry and need proving, not building | `ID_KINDS.regression` exists in `scripts/lib/id-allocator.mjs` with a `contentOf` scan | HIGH | A duplicate allocator, or manual numbering persisting |
| A-05 | Local `main` one commit ahead of `origin/main` at `c0eafd6` is pre-existing user work, not this program's concern | Recorded at session start; primary worktree otherwise clean | HIGH | A false `MAIN_CHANGE_STATUS = CHANGED` verdict |

## Owner Decisions

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

None so far. Questions raised by any specialist during this program are filed
under `docs/questions/` and summarised here once answered.

## Repository Health

PRE_TASK_REPO_HEALTH — measured at session start on 2026-08-21:

- Primary worktree `D:/My Work/hrm-dijipeople/DijiPeople` — CLEAN, no dirty paths.
- Local `main` at `c0eafd6`, one commit ahead of `origin/main` `d6aa738`. Pre-existing user commit; this is the `MAIN_CHANGE_STATUS` baseline.
- `origin/develop` at `4226e53`; `develop` contains `main`.
- Task worktree `D:/My Work/hrm-dijipeople/dijipeople-agent-os` on `agent/agent-operating-system`, cut from `origin/develop`.
- `node scripts/validate-framework.mjs` — 2945 checks, PASS.

POST_TASK_REPO_HEALTH — recorded in the WP-16 package file.

## History

- 2026-08-21 — created at `4226e53`; SESSION-0026; sixteen packages decomposed.
</content>

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- `STANDALONE_ALLOWED` — this task names no bug, backlog item or known
  module. Name one in the record rather than adding a link here by hand.

<!-- GRAPH:END -->
