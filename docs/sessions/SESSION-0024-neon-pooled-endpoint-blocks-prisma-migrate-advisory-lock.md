---
SESSION_ID: SESSION-0024
aliases: [SESSION-0024]
TASK_ID:
TITLE: Neon pooled endpoint blocks Prisma migrate advisory lock
ARCHITECT_INTENT: Neon pooled endpoint blocks Prisma migrate advisory lock
STATUS: ACTIVE
TASK_TYPE: BUG
TASK_SIZE: SMALL
BASE_BRANCH: origin/develop
BASE_SHA: d6aa7380f359f5804bcd03f89d551f9b750b4d6b
TASK_BRANCH: agent/neon-pooler-migration-bug
TARGET_BRANCH: develop
WORKTREE: C:/Users/hp/AppData/Local/Temp/claude/wt-neon-pooler
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-20T21:37:09.447Z
LAST_HEARTBEAT: 2026-08-20T21:37:09.447Z
BLOCKERS: none
---

# SESSION-0024 — Neon pooled endpoint blocks Prisma migrate advisory lock

## Intent

Neon pooled endpoint blocks Prisma migrate advisory lock

## Scope

_To be established during planning._

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-20 — session started from `origin/develop` at `d6aa738`.
