---
SESSION_ID: SESSION-0040
aliases: [SESSION-0040]
TASK_ID:
TITLE: QA verification of 49 fixed bugs, remaining FIX_NOW items, and the lint burn-down
ARCHITECT_INTENT: QA verification of 49 fixed bugs, remaining FIX_NOW items, and the lint burn-down
STATUS: ACTIVE
TASK_TYPE: QA
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: e9819a3fcd8917cb15e14daacd56a9a31d070bb7
TASK_BRANCH: agent/qa-verify-and-burndown
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-qa
AFFECTED_MODULES: [services/api, apps/web, apps/admin, apps/landing, apps/agent-desktop, pkg:config, docs, scripts]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-22T09:25:45.183Z
LAST_HEARTBEAT: 2026-08-22T09:25:45.183Z
BLOCKERS: none
---

# SESSION-0040 — QA verification of 49 fixed bugs, remaining FIX_NOW items, and the lint burn-down

## Intent

QA verification of 49 fixed bugs, remaining FIX_NOW items, and the lint burn-down

## Scope

The user asked for the backlog completed and answered four questions that shaped
this session: no release yet, verify all 49 fixed bugs, type the lint debt
properly module by module, and investigate ITEM-0062 before deciding it.

**Work package 1 — QA verification of 49 FIXED bugs.** Complete.

Each record names a regression in `RegressionId`; each REG names a test. The
pass re-ran *the named test*, not the suite around it — a whole-suite pass proves
the suite passes, which is a different claim and the one that lets a renamed or
inactive guard hide. 52 distinct test files and 5 npm scripts, across every
workspace, plus the DB-backed e2e suite against a migrated and seeded throwaway
Postgres.

Nothing regressed. Five records could not honestly become `VERIFIED`, and
`backlog:rebuild` was right to refuse them: their own QA Retest prose said the
retest had not happened. Each was handled on its merits rather than by editing
the sentence away —

- **BUG-0075** named a scenario nobody had ever run: "exceed the public write
  threshold and assert 429". The invariant guarding it reads controller sources,
  so a *declared-but-broken* guard passes it completely. The scenario now exists
  as `public-rate-limit.e2e-spec.ts` and passes.
- **BUG-0077** said "pending a full QA campaign" while its regression was
  DB-backed and ran in `test:e2e` — which was executed. The prose was behind the
  evidence.
- **BUG-0078**, **BUG-0052** and **BUG-0281** carry real environmental gaps —
  a Stripe webhook, a packaged Electron archive. Those became [[ITEM-0077]] and
  [[ITEM-0078]] rather than sentences that would keep three records at `FIXED`
  for ever. A caveat in prose is not something anybody can schedule.

## Concurrency

No write leases. `SCHEMA_WRITE: NO` — nothing here touches `schema.prisma`.

The throwaway verification database (`dijipeople_qa_verify`) was created,
migrated, seeded and dropped. The populated development database was never
touched, and the credentials were staged outside the repository.

## History

- 2026-08-22 — session started from `origin/develop` at `e9819a3`.
- 2026-08-22 — 49 FIXED bugs verified against their named guards; one new e2e
  suite written to close BUG-0075's stated scenario; two residual gaps raised as
  ITEM-0077 and ITEM-0078.
