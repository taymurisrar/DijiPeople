---
SESSION_ID: SESSION-0021
aliases: [SESSION-0021]
TASK_ID:
TITLE: Identity and multi-tenant membership
ARCHITECT_INTENT: Identity and multi-tenant membership
STATUS: ACTIVE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 844b6d3fb208e74c761070ac64c59e53506f34bc
TASK_BRANCH: agent/identity-and-membership
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople-selfservice
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-20T05:51:24.102Z
LAST_HEARTBEAT: 2026-08-20T05:51:24.102Z
BLOCKERS: none
---

# SESSION-0021 — Identity and multi-tenant membership

## Intent

Identity and multi-tenant membership

## Scope

_To be established during planning._

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-20 — session started from `origin/develop` at `844b6d3`.
