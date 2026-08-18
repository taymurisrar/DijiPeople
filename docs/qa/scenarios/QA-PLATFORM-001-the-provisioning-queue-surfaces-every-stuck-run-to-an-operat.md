---
SCENARIO_ID: QA-PLATFORM-001
aliases: [QA-PLATFORM-001]
TITLE: The provisioning queue surfaces every stuck run to an operator
AREA: tenant-provisioning
MODULE: services/api/src/modules/tenant-control-plane
TYPE: DATABASE
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/test/provisioning-queue.e2e-spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-19
LAST_RESULT: PASS
CREATED_AT: 2026-08-19
UPDATED_AT: 2026-08-19
---

# QA-PLATFORM-001 — The provisioning queue surfaces every stuck run to an operator

## Preconditions

A real PostgreSQL with the migration history applied, and a platform user
holding `tenants.read`. The runs are created by the test, never inherited from a
seed: a scenario that depends on whatever `seed:demo` left behind stops testing
anything the day the seed changes.

## Steps

1. Create runs covering each shape: past its target and still running; failed
   with a failed step carrying a message; running with a skipped step and
   nothing in flight; just started with no steps recorded; succeeded within the
   day; succeeded two days ago.
2. Call the queue as a platform user with `tenants.read`.
3. Call it as a platform user without that permission.
4. Call it as a tenant user that holds a tenant permission key named
   `tenants.read`.
5. Open `/operations/provisioning` in Platform Admin as a signed-in operator.

## Expected Result

Each run derives the most serious true state — `BREACHED` outranks `AT_RISK`,
and a failed run is `FAILED` whatever its target said. A run with no step in
flight and none failed is `MANUAL_ACTION_REQUIRED`; a run with no steps recorded
yet is `IN_PROGRESS`, not stuck. A skipped step counts as settled, so a live run
does not read as stalled. The blocker shown is the failed step's message, not
the vaguer run-level one. A success older than a day is excluded from the queue
but returned on request, and its elapsed time is fixed rather than still
counting.

Steps 3 and 4 are refused. Step 4 refuses on **platform identity**, before the
permission is considered — a key named `tenants.read` inside one tenant must
never buy a read that crosses every tenant.

On the screen: all six states render as text rather than colour alone, rows
arrive in triage order, and the table scrolls inside its own container rather
than dragging the page body sideways at 1366 pixels.

## Notes

Database-backed rather than mocked. Everything worth checking is a property of
the query and its joins — relation paths, step ordering, the recent-successes
filter — and a stubbed Prisma returns whatever the test author imagined. That is
how [[BUG-0070]] reached a branch.

Browser coverage is `e2e/tests/flow-d-provisioning-operations.spec.ts`, verified
green on 2026-08-19.
