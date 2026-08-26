---
SESSION_ID: SESSION-0060
aliases: [SESSION-0060]
TASK_ID:
TITLE: Guard worktree removal against destroying the primary checkout
ARCHITECT_INTENT: Guard worktree removal against destroying the primary checkout
STATUS: ACTIVE
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
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-26T07:55:46.349Z
LAST_HEARTBEAT: 2026-08-26T07:55:46.349Z
BLOCKERS: none
---

# SESSION-0060 — Guard worktree removal against destroying the primary checkout

## Intent

Guard worktree removal against destroying the primary checkout

## Scope

_To be established during planning._

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-26 — session started from `origin/develop` at `6e67e06`.
