---
SESSION_ID: SESSION-0080
aliases: [SESSION-0080]
TASK_ID:
TITLE: BUG-2334: preserve the location failure reason through the attendance adapter
ARCHITECT_INTENT: BUG-2334: preserve the location failure reason through the attendance adapter
STATUS: COMPLETE
TASK_TYPE: BUG
TASK_SIZE: SMALL
BASE_BRANCH: origin/develop
BASE_SHA: 2007fad45d578ee243b404773054814765f6f64a
TASK_BRANCH: agent/attendance-location-capture
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-attendance-loc
AFFECTED_MODULES: [apps/web]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PENDING
MERGE_STATUS: INTEGRATED
STARTED_AT: 2026-08-30T12:45:38.131Z
LAST_HEARTBEAT: 2026-08-30T12:45:38.131Z
BLOCKERS: none
---

# SESSION-0080 — BUG-2334: preserve the location failure reason through the attendance adapter

## Intent

BUG-2334: preserve the location failure reason through the attendance adapter

## Scope

Closes the last `FIX_NOW` item from the attendance investigation. BUG-2334: the
attendance adapter handled a failed location capture with
`throw new Error(location.message)`, reducing a discriminated failure union to a
string, so `classifyLocationCaptureFailure` never ran and all four browser
failures rendered as one generic runtime error in the technical dialog.

It now throws an error carrying `{ statusCode: 422, errorCode: reason, ... }` on
`data` — an existing seam, not a new mechanism: `readErrorData` already forwards
a thrown error's `data` onto the command result.

Deliberately still not done: unifying the two capture paths behind one
capture-and-classify helper. That is the durable fix for the duplication that
caused this, and it is a refactor of the runtime command layer rather than a
bugfix. Left as the honest remainder rather than smuggled in here.

Coverage is REG-363 — behavioural this time, not a source scan, because the
previous record had recorded "no harness exists" as a limitation and that turned
out to be avoidable. Its own limit is recorded in turn: it reproduces two
module-private functions and could pass against a stale copy of one, which the
source-level tie-in assertion mitigates rather than solves.

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-30 — session started from `origin/develop` at `2007fad`.
- 2026-08-30 — fixed, covered by REG-363 and QA-ATTENDANCE-005, mutation-tested
  against the exact shipped line. Not released; `main` was left where the
  earlier release put it.
