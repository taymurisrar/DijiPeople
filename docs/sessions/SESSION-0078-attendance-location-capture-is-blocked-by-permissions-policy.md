---
SESSION_ID: SESSION-0078
aliases: [SESSION-0078]
TASK_ID:
TITLE: Attendance location capture is blocked by Permissions-Policy; validate every attendance scenario
ARCHITECT_INTENT: Attendance location capture is blocked by Permissions-Policy; validate every attendance scenario
STATUS: ACTIVE
TASK_TYPE: BUG
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: f77c0abb9636c2e8b198110ca695ebe0babd0095
TASK_BRANCH: agent/attendance-location-capture
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-attendance-loc
AFFECTED_MODULES: [packages/config, apps/web, apps/admin, services/api/src/common/errors]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-30T09:43:20.501Z
LAST_HEARTBEAT: 2026-08-30T09:43:20.501Z
BLOCKERS: none
---

# SESSION-0078 — Attendance location capture is blocked by Permissions-Policy; validate every attendance scenario

## Intent

The user reported that location cannot be captured when checking in, and that
the app should ask the browser for permission when it has not been given. They
also asked for the tenant attendance settings to be tested and validated, and
for every attendance scenario to be verified.

## Scope

Root cause was found in the shared security header definition and confirmed in
the browser against production before any code was changed.

Fixed here:

- **BUG-2331** (HIGH) — `Permissions-Policy: geolocation=()` disabled geolocation
  for the document's own origin, so Chrome refused `getCurrentPosition` before
  the permission layer and never prompted. Web attendance was impossible for
  every employee of every tenant. `packages/config`, `apps/web`, `apps/admin`.
- **BUG-2332** (HIGH) — no attendance reason code existed in the error catalog,
  so `HttpExceptionFilter` rewrote every refusal to `VALIDATION_FAILED` and the
  web classifier routed it to the platform's technical error dialog. Found only
  because fixing BUG-2331 made the refusal path reachable for the first time.
- **BUG-2333** (MEDIUM) — the attendance adapter ignored the `storeUserAgent`
  tenant privacy setting and sent the UA string unconditionally.

Recorded, deliberately not fixed here:

- **BUG-2334** (MEDIUM, FIX_NOW) — the same adapter rethrows a location capture
  failure as a bare `Error`, discarding the reason code. Fixing it changes
  control flow across the runtime command layer; doing that late in this task
  without room to verify it is how the two paths came to differ in the first
  place.
- **BUG-2335** (PRODUCT_DECISION) — "Allow approximate IP fallback" is a live,
  editable setting whose provider is an unconditional failure stub. Needs a
  product decision on whether approximate location may satisfy an attendance
  integrity control at all.

Settings validated and found **healthy**: the attendance settings save path
works (verified by writing a value, reading it back from
`/api/attendance/runtime-context` rather than from the form, and reverting), and
the seven mandated location settings now render as disabled read-only fields —
the UI half of BUG-1979 is already fixed on `develop`. The two non-catalog
checkboxes BUG-1978 describes are no longer rendered, so that record's premise
should be re-measured before anyone works it.

## Concurrency

`node scripts/session.mjs check` classified this work `SAFE_PARALLEL` against
four other active sessions; no write leases were needed and none were taken.
SESSION-0076 (open bug burndown) may touch the attendance settings records
BUG-1978/1979/1980/1981 — this session deliberately did not modify any of them,
only measured their current truth and reported it above.

## History

- 2026-08-30 — session started from `origin/develop` at `f77c0ab`.
- 2026-08-30 — root cause confirmed in the browser on production; the browser's
  own message was "Geolocation has been disabled in this document by permissions
  policy." Fix verified live by rewriting only that response header on the real
  signed-in attendance page.
- 2026-08-30 — five bug records filed, three fixed, three regression entries
  (REG-360/361/362) and three QA scenarios (QA-ATTENDANCE-002/003/004) created.
