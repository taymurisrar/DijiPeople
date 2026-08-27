---
SESSION_ID: SESSION-0060
aliases: [SESSION-0060]
TASK_ID:
TITLE: Guard worktree removal against destroying the primary checkout
ARCHITECT_INTENT: Guard worktree removal against destroying the primary checkout
STATUS: COMPLETE
TASK_TYPE: FRAMEWORK
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: 6e67e0634a4b23b27602f6bfbea7130191cc7af1
TASK_BRANCH: agent/worktree-removal-guard
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/wt-wtguard
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-08-26T07:55:46.349Z
LAST_HEARTBEAT: 2026-08-26T07:55:46.349Z
BLOCKERS: none
---

# SESSION-0060 — Guard worktree removal against destroying the primary checkout

## Intent

Guard worktree removal against destroying the primary checkout

## Scope

Guard the worktree-removal step so it cannot destroy the primary checkout, after
it did exactly that at the end of SESSION-0059: 3,072 tracked files, every
installed dependency and the generated Prisma client, removed from the user's
own workspace by a routine cleanup command following a junction.

In scope: the guard script, the npm entry point, both documents that teach the
worktree lifecycle, nine mutation-tested validation checks, and the incident
records (BUG-1494, REG-262, QA-PLATFORM-027).

Out of scope: changing how worktrees are *created*. Junctioning node_modules
stays — it saves minutes per worktree and is not the defect. The defect was that
removal followed the link, and that is what the guard fixes.

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-26 — session started from `origin/develop` at `6e67e06`.
