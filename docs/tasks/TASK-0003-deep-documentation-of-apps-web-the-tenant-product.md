---
TASK_ID: TASK-0003
TITLE: Deep documentation of apps/web, the tenant product
TYPE: KNOWLEDGE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-17
AFFECTED_MODULES: [apps/web, packages/config, settings-runtime, employees, payroll, attendance, approvals]
AGENTS: [Architect, Frontend, UI/UX, Reviewer, QA, Integrator, Release/DevOps, Knowledge Capture]
DEPENDENCIES: WP-02..WP-05 depend on WP-01; WP-06 depends on WP-02..WP-05; WP-07..WP-09 depend on WP-06
CURRENT_PACKAGE: WP-02
COMPLETED_PACKAGES: [WP-01]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0003 — Deep documentation of apps/web, the tenant product

## Objective

`apps/web` is the largest application in the monorepo — **1,100 TypeScript
files, 253 pages, 416 route handlers, ~145,000 lines** — and unlike the three
applications documented by TASK-0002 it is *not* undocumented. It already has
`docs/knowledge/modules/tenant-application.md` and
`architecture/runtime-module-system.md`, an `AGENTS.md`, and coverage in four
`.agent/context` documents.

So the objective is different: **verify what is already claimed, and document
the depth that is missing.** A note that repeats existing knowledge is a
regression here, not a contribution. This task produces one refreshed
application note and one new architecture note carrying `Last Verified` /
`Verified Against SHA` / `Source Paths`, corrections to whatever the code now
contradicts, durable records for material findings, and an Obsidian publication.

It is finished when a future agent can answer "how does a screen in the tenant
product get built, authorised and rendered, and where does that break down"
without re-reading 145,000 lines.

No product behaviour changes. `KNOWLEDGE` permits exactly one exception —
verified documentation drift — and only documents are corrected.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Repo health, existing-knowledge audit, placement decision | DONE | — | Architect, Release/DevOps | agent/knowledge-web-app-documentation | — | NOT_REQUIRED | — | — | — |
| WP-02 | Structure and runtime module system audit | IN_PROGRESS | WP-01 | Frontend | agent/knowledge-web-app-documentation | — | — | — | — | — |
| WP-03 | Auth, tenant resolution, proxy and security audit | IN_PROGRESS | WP-01 | Reviewer, Backend/API | agent/knowledge-web-app-documentation | — | — | — | — | — |
| WP-04 | Settings runtime, branding and UX state audit | IN_PROGRESS | WP-01 | UI/UX | agent/knowledge-web-app-documentation | — | — | — | — | — |
| WP-05 | Testing, CI, environment and deployment audit | IN_PROGRESS | WP-01 | QA, Release/DevOps | agent/knowledge-web-app-documentation | — | — | — | — | — |
| WP-06 | Knowledge notes and documentation corrections | NOT_STARTED | WP-02..WP-05 | Architect, Knowledge Capture | agent/knowledge-web-app-documentation | — | — | — | — | — |
| WP-07 | Findings to bug and backlog records, with triage | NOT_STARTED | WP-06 | QA, Reviewer, Architect | agent/knowledge-web-app-documentation | — | — | — | — | — |
| WP-08 | Documentation verification and review | NOT_STARTED | WP-06 | QA, Reviewer | agent/knowledge-web-app-documentation | — | — | — | — | — |
| WP-09 | Integration, Obsidian sync and cleanup | NOT_STARTED | WP-07, WP-08 | Integrator, Release/DevOps | agent/knowledge-web-app-documentation | — | — | — | — | — |

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | `docs/knowledge/modules/tenant-application.md` must be refreshed **in place** rather than moved to `product/`, despite the application-note convention TASK-0002 recorded | `scripts/sync-obsidian.mjs` contains no delete/prune logic — verified by search. Moving the source would strand the existing vault note in `03 - Modules/Generated` as the vault's first orphan | HIGH | An orphaned note in an agent-owned folder reads as current truth and is unreachable from the repository |
| A-02 | The vault currently has **zero** orphaned generated notes | Compared every note under the eleven mapped `Generated/` paths against its repository source; the only two candidates resolved once the `docs/decisions → 05 - Decisions/Generated/ADR` mapping was applied correctly | HIGH | Would change A-01 from "avoid creating the first orphan" to "there is already a cleanup problem" |
| A-03 | Four parallel read-only audits can cover this app without conflicting, split by concern rather than by directory | Each was scoped to a disjoint question set and told explicitly which concerns belong to the others | MEDIUM | Overlap wastes effort; a gap between scopes leaves an area unaudited — checked at synthesis |
| A-04 | Records this task produces will not collide with concurrent branches | TASK-0002 hit exactly this: `new-bug.mjs` allocates from the highest existing id, which does not protect against concurrent branches. Ids will be re-verified immediately before the PR merges | LOW | Renumbering ten records and every cross-reference, as TASK-0002 had to |

## Owner Decisions

Genuine product or business questions only. Recorded at the end.

## Repository Health

PRE_TASK_REPO_HEALTH = PASS_WITH_WARNINGS — `node scripts/repo-health.mjs` at
`1af3690`, `MAIN_SYNC_STATUS = SYNCED`, no unfinished Git operations, no stale
worktrees. One dirty path, `D .obsidian-sync.example.json`, **pre-exists this
task and belongs to someone else** — left untouched per the working agreements.

POST_TASK_REPO_HEALTH — recorded after the merge.

## History

- 2026-08-17 — created at `1af3690`.
</content>
