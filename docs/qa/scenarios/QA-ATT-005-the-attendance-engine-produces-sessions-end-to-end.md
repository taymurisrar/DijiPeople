---
SCENARIO_ID: QA-ATT-005
aliases: [QA-ATT-005]
TITLE: The attendance engine produces sessions end to end
AREA: attendance
MODULE: services/api/test
TYPE: E2E
RISK: HIGH
AUTOMATION_STATUS: BLOCKED_INFRASTRUCTURE
TEST_REFERENCE: 
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 
LAST_RESULT: BLOCKED
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-ATT-005 — The attendance engine produces sessions end to end

## Preconditions

A live database, configured work patterns and sites.

## Steps

1. Ingest raw punches for a working day.
2. Run the engine.
3. Read the resulting sessions and worked minutes.

## Expected Result

Sessions match the configured pattern, and worked minutes agree with the unit-level interpretation.

## Notes

`services/api/test/attendance-engine.e2e-spec.ts`. Blocked here for want of a database.
