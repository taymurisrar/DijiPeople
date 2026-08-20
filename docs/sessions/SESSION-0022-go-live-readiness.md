---
SESSION_ID: SESSION-0022
aliases: [SESSION-0022]
TASK_ID: TASK-0010
TITLE: Go-live readiness
ARCHITECT_INTENT: Go-live readiness
STATUS: ACTIVE
TASK_TYPE: FEATURE
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: 95551bcf29c9d1b807a8fecac86c39b273f651bd
TASK_BRANCH: agent/go-live-readiness
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople-selfservice
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-20T11:10:18.564Z
LAST_HEARTBEAT: 2026-08-20T11:10:18.564Z
BLOCKERS: none
---

# SESSION-0022 — Go-live readiness

## Intent

Go-live readiness

## Scope

[[TASK-0010]]. Clearing what stands between `develop` and a production release,
so `main` is updated deliberately rather than hopefully.

Four owner decisions were taken **before** any work, because each changed what
would be built: real prices rather than placeholders, publication wired into the
release command, [[ITEM-0069]] fixed before release rather than after, and
[[BUG-0052]] accepted with the risk recorded.

Two of the four are code and are done. One — the price list — is blocked on the
owner and nothing ships to a market without it. The fourth is a judgement to be
written into the release record.

## Concurrency

`schema` lease taken for the discovery-throttle columns and released when the
migration was verified. `session.mjs check` returned `SAFE_PARALLEL` against the
other active sessions; none touches `auth`, `users` or `legal`.

Database work used throwaway databases only. The populated `dijipeople`
development database was not touched at all by this session.

## History

- 2026-08-20 — session started from `origin/develop` at `95551bc`, immediately
  after TASK-0009 integrated.
- 2026-08-20 — WP-01: [[ITEM-0069]] closed. Discovery gets its own throttle, so
  the public endpoint bounds guessing without being usable as a lockout weapon
  against a known address.
- 2026-08-20 — WP-02: `release:api` publishes the legal set, so a purchase
  finally records consent. Two more assertions inverted rather than deleted —
  the third time in this programme that a guard outlived its premise.
- 2026-08-20 — WP-03 blocked on the owner: real prices per plan and market.
