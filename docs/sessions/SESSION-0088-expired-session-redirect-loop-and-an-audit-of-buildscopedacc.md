---
SESSION_ID: SESSION-0088
aliases: [SESSION-0088]
TASK_ID:
TITLE: Expired-session redirect loop, and an audit of buildScopedAccessWhere callers
ARCHITECT_INTENT: Expired-session redirect loop, and an audit of buildScopedAccessWhere callers
STATUS: ACTIVE
TASK_TYPE: BUG
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: 4a7c0d4a88af08f24eac6e39ea7d9bd4478baf77
TASK_BRANCH: agent/session-redirect-loop
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-31T05:38:51.580Z
LAST_HEARTBEAT: 2026-08-31T05:38:51.580Z
BLOCKERS: none
---

# SESSION-0088 — Expired-session redirect loop, and an audit of buildScopedAccessWhere callers

## Intent

Expired-session redirect loop, and an audit of buildScopedAccessWhere callers

## Scope

_To be established during planning._

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-31 — session started from `origin/develop` at `4a7c0d4`.
