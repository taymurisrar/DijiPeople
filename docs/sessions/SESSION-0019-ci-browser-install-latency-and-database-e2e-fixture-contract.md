---
SESSION_ID: SESSION-0019
aliases: [SESSION-0019]
TASK_ID:
TITLE: CI browser install latency and database e2e fixture contract
ARCHITECT_INTENT: CI browser install latency and database e2e fixture contract
STATUS: ACTIVE
TASK_TYPE: BUG
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: cda00331bd48ba1e809d54e98e2dbf7f28ebb7ca
TASK_BRANCH: agent/ci-e2e-remediation
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-ci-e2e
AFFECTED_MODULES: [.github/workflows, e2e, scripts, services/api/test, services/api/prisma]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-19T20:24:28.476Z
LAST_HEARTBEAT: 2026-08-19T20:24:28.476Z
BLOCKERS: none
---

# SESSION-0019 — CI browser install latency and database e2e fixture contract

## Intent

CI browser install latency and database e2e fixture contract

## Scope

Two independent CI defects, worked as parallel streams.

**A — the browser install.** `browser-e2e`'s `Install the browser` step ranged
from 20s to 25m55s. Measured into components from raw job logs, root-caused to
`--with-deps` doing apt work that installs no browser library, and replaced
with a measured, launch-verified install. `BUG-0079`.

**B — the database e2e fixture contract.** Suites reaching for data they did
not create. Converted onto `test/helpers/db-fixtures.ts`, teardown repaired,
open handles eliminated, and the job promoted into `ci-required`. `ITEM-0047`.

Out of scope, and deliberately: no application defect was found once the
fixtures were correct, so Backend/API and the Security Agent — both named as
conditional in the request — were not invoked.

## Concurrency

`SAFE_PARALLEL` against SESSION-0003, SESSION-0015 and SESSION-0018, all
active throughout. No write lease taken: `SCHEMA_WRITE: NO`, and the databases
this session used were throwaways of its own creation — the populated
`dijipeople` development database was never touched.

One cross-session interaction is worth recording. `AGENTS.md` carries
provenance lines that must move with any claim change in that file, and moving
them means re-deriving what they vouch for. Doing so found `@Public()` had
drifted from 32 handlers / 12 controllers to 33 / 13 through another session's
work. Corrected here rather than left wrong beneath a line dated today.

Live state: `node scripts/session.mjs list`.

## History

- 2026-08-19 — session started from `origin/develop` at `cda0033`.
