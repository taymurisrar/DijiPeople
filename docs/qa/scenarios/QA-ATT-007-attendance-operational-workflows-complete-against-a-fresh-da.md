---
SCENARIO_ID: QA-ATT-007
aliases: [QA-ATT-007]
TITLE: Attendance operational workflows complete against a fresh database
AREA: attendance
MODULE: services/api/test
TYPE: E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/test/attendance-operational.e2e-spec.ts
RELATED_BUGS: [BUG-0049]
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-17
LAST_RESULT: FAIL
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-ATT-007 — Attendance operational workflows complete against a fresh database

## Preconditions

An empty disposable PostgreSQL database has the committed migrations and
production-safe seed configuration applied. The suite owns the tenant,
employees, schedules and attendance rows it creates.

## Steps

1. Run `services/api/test/attendance-operational.e2e-spec.ts` through the API
   E2E configuration against the disposable database.
2. Exercise the operational attendance transitions and assertions declared by
   the suite.
3. Tear down only the records created by the suite.

## Expected Result

Every operational transition returns the expected contract, persists the
expected tenant-scoped state, and tears down without missing-record or leaked
handle failures.

## Notes

Exact task-branch CI run `32020076245` at `47b127f` failed this suite while the
report-only job concluded green. The same run finished with 7 failed / 8 passed
suites and 148 failed / 79 passed tests. WP-04 owns root-cause isolation; this
scenario must remain `FAIL` until a later exact run executes it successfully.
